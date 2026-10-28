import { timingSafeEqual } from 'node:crypto';
import { getSupabaseServerForRequest } from '../../../lib/supabase-server';

function authorized(request: Request): boolean {
  const expected = process.env.STATUS_METRICS_TOKEN || '';
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  return expected.length >= 32
    && Buffer.byteLength(supplied) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const result = await getSupabaseServerForRequest(request).rpc('mission_control_metrics');
  if (result.error || !result.data) {
    return Response.json(
      { error: 'Mission Control metrics are unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }

  return Response.json({ data: result.data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
