import { getSupabaseServerForRequest } from '../../../lib/supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from '../../../lib/server/resolve-notification-identity';
import { activityRoute } from '../../../lib/marketing';

export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return Response.json({ error: identity.error }, { status: identity.status });
  if (!identity.registryUserId) return Response.json({ error: 'Linked account required' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const route = typeof body?.path === 'string' ? activityRoute(body.path) : null;
  if (!route) return Response.json({ error: 'Unsupported activity route' }, { status: 400 });
  let recorded;
  try {
    recorded = await getSupabaseServerForRequest(request).rpc('record_marketing_activity', {
      p_user: identity.registryUserId, p_key: `navigation:${route}:${new Date().toISOString().slice(0, 10)}`,
      p_kind: 'page_view', p_event: null, p_source: 'observed_client',
    });
  } catch {
    // Activity tracking is intentionally best-effort. It must never turn a
    // successful page navigation into a production error when the analytics
    // RPC or database is briefly unavailable.
    return Response.json(
      { data: { recorded: false, trust: 'observed', provisionalPoints: 0 } },
      { status: 202, headers: { 'Cache-Control': 'private, no-store', Warning: '299 - "Activity logging temporarily unavailable"' } },
    );
  }
  if (recorded.error) {
    return Response.json(
      { data: { recorded: false, trust: 'observed', provisionalPoints: 0 } },
      { status: 202, headers: { 'Cache-Control': 'private, no-store', Warning: '299 - "Activity logging temporarily unavailable"' } },
    );
  }
  return Response.json({ data: { recorded: true, trust: 'observed', provisionalPoints: 0 } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
