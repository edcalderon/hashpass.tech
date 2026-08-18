import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { verifyUserToken } from '@hashpass/auth';

/**
 * POST /api/auth/delete-account
 *
 * Permanently deletes a user account. Must be called after OTP verification.
 * Uses the service-role client so it can delete from auth.users.
 *
 * Auth: Bearer <access_token> in Authorization header.
 * Body: { userId: string } — must match the authenticated user's ID.
 *
 * Token verification strategy:
 *   1. Try supabase.auth.getUser(token) — works for native Android (Supabase JWT)
 *   2. Fall back to verifyUserToken(token, request) — works for web (Directus token)
 *      Note: verifyUserToken routes by hostname, so api.hashpass.tech → Directus.
 *      That's correct for web but wrong for native, hence trying Supabase first.
 */
export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  try {
    // Verify the caller is authenticated
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return json({ error: 'Authorization header required' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Try Supabase JWT first (covers native Android + web Supabase sessions)
    let callerUser: { id: string; email?: string } | null = null;
    const { data: { user: supabaseUser } } = await supabase.auth.getUser(token);
    if (supabaseUser) {
      callerUser = { id: supabaseUser.id, email: supabaseUser.email };
    } else {
      // Fall back to provider-routed verification (covers web Directus sessions)
      const { user: providerUser, error: providerErr } = await verifyUserToken(token, request);
      if (providerErr || !providerUser) {
        console.error('[delete-account] token verification failed (both paths):', providerErr);
        return json({ error: 'Unauthorized' }, 401);
      }
      callerUser = { id: providerUser.id, email: providerUser.email };
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return json({ error: 'userId is required' }, 400);
    }

    // Users can only delete their own account
    if (callerUser.id !== userId) {
      return json({ error: 'Forbidden: cannot delete another user\'s account' }, 403);
    }

    // ── Data cleanup ──────────────────────────────────────────────────────────
    // Run each delete independently so a missing table never blocks the rest.

    // meetings has no user_id column (verified live against the deployed
    // schema: host_id/attendee_id is the active FK'd pair -- meetings_host_id_fkey/
    // meetings_attendee_id_fkey -- speaker_id/requester_id also exist on the
    // table but aren't what real app code reads/writes, e.g.
    // app/api/bsl/bookings/[id]+api.ts). Filtering on user_id silently
    // matched zero rows on every call (caught by the try/catch below,
    // logged, and treated as success), meaning meetings were never actually
    // deleted for any user despite this being promised in the account
    // deletion disclosure. meeting_chat_messages.meeting_id has an ON
    // DELETE CASCADE FK to meetings, so fixing this also cleans up every
    // chat message tied to those meetings (any sender, not just this
    // user) -- the separate meeting_chat_messages step below remains as a
    // defense-in-depth backstop, not the primary cleanup path anymore.
    //
    // meeting_requests and event_chat_direct_messages are two-sided (a
    // request has a requester AND a speaker; a direct message has a sender
    // AND a recipient) -- the original cleanup only ever covered one side
    // of each, e.g. meeting_requests.speaker_id (received requests) was
    // never cleaned up. event_chat_messages/event_chat_direct_messages
    // (the event-wide chat and 1:1 direct messages within an event --
    // distinct from meeting_chat_messages, the end-to-end encrypted
    // meeting-specific chat) were never cleaned up at all.
    const cleanupSteps: Array<{ table: string; filter: Record<string, string> }> = [
      { table: 'passes',              filter: { user_id: userId } },
      { table: 'pass_request_limits', filter: { user_id: userId } },
      { table: 'user_request_limits', filter: { user_id: userId } },
      { table: 'user_tutorial_progress', filter: { user_id: userId } },
      { table: 'meeting_requests',    filter: { requester_id: userId } },
      { table: 'meetings',            filter: { host_id: userId } },
      { table: 'user_blocks',         filter: { blocker_user_id: userId } },
      { table: 'user_agenda_status',  filter: { user_id: userId } },
      { table: 'user_email_tracking', filter: { user_id: userId } },
      { table: 'user_profiles',       filter: { user_id: userId } },
      { table: 'user_roles',          filter: { user_id: userId } },
      { table: 'otp_codes',           filter: { email: callerUser.email ?? '' } },
      { table: 'chat_last_seen',      filter: { user_id: userId } },
      { table: 'meeting_chat_messages', filter: { sender_id: userId } },
      { table: 'event_chat_messages', filter: { sender_id: userId } },
      { table: 'event_chat_direct_messages', filter: { sender_id: userId } },
      // Canonical user registry — match by email to cover all provider IDs
      { table: 'user',                filter: { email: callerUser.email ?? '' } },
    ];

    for (const step of cleanupSteps) {
      try {
        let q = (supabase as any).from(step.table).delete();
        for (const [col, val] of Object.entries(step.filter)) {
          q = q.eq(col, val);
        }
        const { error } = await q;
        if (error) {
          // Log but continue — table might not exist or row not found
          console.warn(`[delete-account] cleanup ${step.table}:`, error.message);
        }
      } catch (e) {
        console.warn(`[delete-account] cleanup ${step.table} threw:`, e);
      }
    }

    // Two-sided relationships: the loop above only covers one side of each,
    // so the other side needs its own explicit delete call (matching the
    // existing user_blocks.blocked_user_id pattern this file already used).
    const secondSideCleanupSteps: Array<{ table: string; column: string }> = [
      { table: 'user_blocks', column: 'blocked_user_id' },
      { table: 'meetings', column: 'attendee_id' },
      { table: 'meeting_requests', column: 'speaker_id' },
      { table: 'event_chat_direct_messages', column: 'recipient_id' },
    ];
    for (const step of secondSideCleanupSteps) {
      try {
        const { error } = await (supabase as any).from(step.table).delete().eq(step.column, userId);
        if (error) {
          console.warn(`[delete-account] cleanup ${step.table} (${step.column}):`, error.message);
        }
      } catch (e) {
        console.warn(`[delete-account] cleanup ${step.table} (${step.column}) threw:`, e);
      }
    }

    // ── Delete from auth.users ────────────────────────────────────────────────
    // userId from the client may be a Directus UUID when the user authenticated via
    // the browser OAuth/Directus path. In that case Supabase won't find it.
    // Always resolve the real Supabase UUID by email first (reliable across providers).
    let supabaseAuthId = userId;
    const email = callerUser.email;

    if (email) {
      try {
        const { data: listData } = await (supabase as any).auth.admin.listUsers({ page: 1, perPage: 1000 });
        const supabaseUser = (listData?.users ?? []).find((u: any) => u.email === email);
        if (supabaseUser?.id) {
          supabaseAuthId = supabaseUser.id;
          console.log(`[delete-account] Resolved Supabase auth ID by email: ${supabaseAuthId}`);
        } else {
          console.warn(`[delete-account] No Supabase auth user found for email ${email}; skipping auth deletion`);
          // User may not have a Supabase account (pure Directus). Data is already cleaned — treat as success.
          return json({ success: true, message: 'Account data deleted (no Supabase auth user found)' }, 200);
        }
      } catch (listErr: any) {
        console.warn('[delete-account] listUsers failed, falling back to provided userId:', listErr?.message);
      }
    }

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(supabaseAuthId);
    if (deleteAuthError) {
      console.error('[delete-account] auth.admin.deleteUser failed:', deleteAuthError);
      return json({ error: `Failed to delete auth user: ${deleteAuthError.message}` }, 500);
    }

    console.log(`[delete-account] User ${userId} deleted successfully`);
    return json({ success: true, message: 'Account deleted successfully' }, 200);

  } catch (error: any) {
    console.error('[delete-account] Unhandled error:', error);
    return json({ error: error.message || 'Failed to delete account' }, 500);
  }
}

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
