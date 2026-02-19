import { supabaseServer as supabase } from '@/lib/supabase-server';
import { rateLimitOk } from '@/lib/bsl/rateLimit';

// Helper function to check admin status
// Admin tiers: superAdmin > admin > moderator
async function isAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['superAdmin', 'admin', 'moderator'])
      .limit(1); // Limit to 1 since we only need to check existence
    
    if (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
    
    return !!data && data.length > 0;
  } catch {
    return false;
  }
}

// Get authentication from request headers
async function getAuthUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  
  try {
    // Extract token and verify with Supabase
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

/**
 * GET /api/qr/admin - List all QR codes with filters (admin only)
 */
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimitOk(`qr-admin:${ip}`)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }

  const userId = await getAuthUserId(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const isUserAdmin = await isAdmin(userId);
  if (!isUserAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const qrType = searchParams.get('type');
  const passId = searchParams.get('pass_id');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
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

  const userId = await getAuthUserId(request);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const isUserAdmin = await isAdmin(userId);
  if (!isUserAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403 });
  }

  try {
    const body = await request.json();
    const { token, reason } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }), { status: 400 });
    }

    const { data, error } = await supabase
      .rpc('revoke_qr_code', {
        p_token: token,
        p_admin_user_id: userId,
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

