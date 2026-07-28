import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '@/lib/server/resolve-notification-identity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/bslatam/meeting-requests?speakerId=...&status=cancelled — the
// authenticated user's meeting requests with one speaker, optionally
// filtered by status.
//
// meeting_requests.requester_id and .speaker_id are both uuid columns, but
// two things the client can't safely assume: the caller's own id can be a
// Better Auth id (not a uuid, for accounts that never had a Supabase auth
// session), and speaker.id can be a config slug (e.g. 'claudia-sotelo') for
// tour-stop events (chile2026/peru2026/colombia2026) whose speakers only
// exist in packages/config/src/events.ts, not as real bsl_speakers rows --
// there is no meeting_requests row possible for those speakers at all.
// Querying either directly is rejected by Postgres with a 400 before RLS is
// even evaluated, which is what the client was hitting calling Supabase
// directly for both cases. Resolving the identity server-side and treating
// a non-uuid speakerId as "no requests possible" (rather than attempting a
// query guaranteed to fail) avoids both.
//
// Uses identity.supabaseUserId (auth.users(id)), NOT registryUserId
// (public.user(id)) — unlike user_agenda_status/notifications, which
// genuinely FK to the registry (confirmed via real 23503 errors, see
// resolve-notification-identity.ts), meeting_requests.requester_id has no
// FK constraint at all, and the live write path
// (packages/tools/scripts/sql/target-bsl-bootstrap.sql's
// insert_meeting_request RPC) stores the caller-supplied id unchanged after
// validating it against passes.user_id via can_make_meeting_request — and
// passes.user_id is the auth.users id (set by the BSL general-pass
// provisioning trigger). Using registryUserId here would query a different
// id space than what every request is actually written with.
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }

  if (!identity.supabaseUserId) {
    return Response.json({ data: [] });
  }

  const url = new URL(request.url);
  const speakerId = url.searchParams.get('speakerId');
  const status = url.searchParams.get('status');
  if (!speakerId) {
    return Response.json({ error: 'speakerId is required' }, { status: 400 });
  }

  if (!UUID_PATTERN.test(speakerId)) {
    return Response.json({ data: [] });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    let query = supabase
      .from('meeting_requests')
      .select('*')
      .eq('requester_id', identity.supabaseUserId)
      .eq('speaker_id', speakerId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[meeting-requests] fetch error:', error);
      return Response.json({ error: 'Failed to fetch meeting requests' }, { status: 500 });
    }

    return Response.json({ data: data || [] });
  } catch (error) {
    console.error('[meeting-requests] unexpected fetch error:', error);
    return Response.json({ error: 'Failed to fetch meeting requests' }, { status: 500 });
  }
}
