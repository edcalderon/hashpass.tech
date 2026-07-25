import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeGlobalAdmin } from '@/lib/server/global-admin';

/**
 * GET /api/qr/admin/logs - Get QR scan logs (admin only)
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimitOk(`qr-admin:${ip}`)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;

  const { searchParams } = new URL(request.url);
  const qrCodeId = searchParams.get('qr_code_id');
  const token = searchParams.get('token');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = authorization.supabase
      .from('qr_scan_logs')
      .select('*', { count: 'exact' })
      .order('scanned_at', { ascending: false })
      .range(from, to);

    if (qrCodeId) {
      query = query.eq('qr_code_id', qrCodeId);
    }
    if (token) {
      query = query.eq('token', token);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('QR scan logs fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch scan logs' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      data: data || [],
      page,
      pageSize,
      total: count || 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { status: 500 });
  }
}
