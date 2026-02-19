import { supabaseServer as supabase } from '@/lib/supabase-server';

export async function GET() {
  const [{ count: total }, { count: accepted }, { count: requested }] = await Promise.all([
    supabase.from('BSL_Bookings').select('id', { count: 'exact', head: true }),
    supabase.from('BSL_Bookings').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
    supabase.from('BSL_Bookings').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
  ]);
  const acceptanceRate = total ? Math.round(((accepted || 0) / total) * 100) : 0;
  return new Response(JSON.stringify({ total: total || 0, accepted: accepted || 0, requested: requested || 0, acceptanceRate }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}


