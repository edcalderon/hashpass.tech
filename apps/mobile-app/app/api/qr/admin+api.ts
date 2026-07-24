import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeGlobalAdmin } from '@/lib/server/global-admin';

/**
 * GET /api/qr/admin - List all QR codes with filters (admin only)
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimitOk(`qr-admin:${ip}`)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const qrType = searchParams.get('type');
  const passId = searchParams.get('pass_id');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = authorization.supabase
      .from('qr_codes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq('status', status);
    }
    if (qrType) {
      query = query.eq('qr_type', qrType);
    }
    if (passId) {
      query = query.eq('pass_id', passId);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('QR codes fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch QR codes' }), {
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

/**
 * POST /api/qr/admin/revoke - Revoke a QR code (admin only)
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimitOk(`qr-admin:${ip}`)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;

  try {
    const body = await request.json();
    const { token, reason } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), { status: 400 });
    }

    const { data, error } = await authorization.supabase
      .rpc('revoke_qr_code', {
        p_token: token,
        p_admin_user_id: authorization.userId,
        p_reason: reason || null,
      })
      .single();

    if (error) {
      console.error('Error revoking QR:', error);
      return new Response(JSON.stringify({ error: 'Failed to revoke QR code' }), { status: 500 });
    }

    return new Response(JSON.stringify({ 
      success: data,
      message: 'QR code revoked successfully' 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { status: 500 });
  }
}
