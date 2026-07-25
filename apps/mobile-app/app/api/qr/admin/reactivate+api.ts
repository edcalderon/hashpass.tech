import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeGlobalAdmin } from '@/lib/server/global-admin';

/**
 * POST /api/qr/admin/reactivate - Reactivate a QR code (admin only)
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
    const { token } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), { status: 400 });
    }

    const { data, error } = await authorization.supabase
      .rpc('reactivate_qr_code', {
        p_token: token,
        p_admin_user_id: authorization.userId,
      })
      .single();

    if (error) {
      console.error('Error reactivating QR:', error);
      return new Response(JSON.stringify({ error: 'Failed to reactivate QR code' }), { status: 500 });
    }

    return new Response(JSON.stringify({ 
      success: data,
      message: 'QR code reactivated successfully' 
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('Unexpected error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { status: 500 });
  }
}
