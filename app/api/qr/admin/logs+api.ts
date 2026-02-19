import { supabaseServer as supabase } from '@/lib/supabase-server';
import { rateLimitOk } from '@/lib/bsl/rateLimit';

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

async function getAuthUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  
  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

/**
 * GET /api/qr/admin/logs - Get QR scan logs (admin only)
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
  const qrCodeId = searchParams.get('qr_code_id');
  const token = searchParams.get('token');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    let query = supabase
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

