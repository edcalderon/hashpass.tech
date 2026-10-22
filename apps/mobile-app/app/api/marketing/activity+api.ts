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
    return Response.json({ error: 'Activity logging unavailable' }, { status: 503 });
  }
  return recorded.error ? Response.json({ error: 'Activity logging unavailable' }, { status: 503 }) : Response.json({ data: { recorded: true, trust: 'observed', provisionalPoints: 0 } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
