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
    const { user: callerUser, error: authError } = await verifyUserToken(token, request);
    if (authError || !callerUser) {
      return json({ error: 'Unauthorized' }, 401);
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

    const cleanupSteps: Array<{ table: string; filter: Record<string, string> | Record<string, string>[] }> = [
      { table: 'passes',              filter: { user_id: userId } },
      { table: 'pass_request_limits', filter: { user_id: userId } },
      { table: 'user_tutorial_progress', filter: { user_id: userId } },
      { table: 'meeting_requests',    filter: { requester_id: userId } },
      { table: 'meetings',            filter: { user_id: userId } },
      { table: 'user_blocks',         filter: { blocker_user_id: userId } },
      { table: 'user_agenda_status',  filter: { user_id: userId } },
      { table: 'user_email_tracking', filter: { user_id: userId } },
      { table: 'user_profiles',       filter: { user_id: userId } },
      { table: 'user_roles',          filter: { user_id: userId } },
      { table: 'otp_codes',           filter: { email: callerUser.email ?? '' } },
      { table: 'chat_last_seen',      filter: { user_id: userId } },
      { table: 'meeting_chat_messages', filter: { sender_id: userId } },
      // Canonical user registry (V004) — match by email to cover all provider IDs
      { table: 'users',               filter: { email: callerUser.email ?? '' } },
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

    // Also remove as blocked user (different column name)
    try {
      await (supabase as any).from('user_blocks').delete().eq('blocked_user_id', userId);
    } catch (e) {
      console.warn('[delete-account] cleanup user_blocks (blocked_user_id):', e);
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
