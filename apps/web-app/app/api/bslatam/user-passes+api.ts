import { supabaseServer as supabase } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'demo-user'; // For demo purposes
  const eventId = searchParams.get('eventId') || 'bsl2025';

  try {
    // Get user passes from database
    const { data: userPasses, error } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('User passes fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch user passes' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If no passes found, create demo passes for BSL2025
    if (!userPasses || userPasses.length === 0) {
      console.log('No user passes found, creating demo passes...');
      
      const demoPasses = [
        {
          id: 'pass-business-1',
          user_id: userId,
          event_id: eventId,
          pass_type: 'business',
          status: 'active',
          price_usd: 249.00,
          access_features: [
            'All conferences (Nov 12-14)',
            'Booth area access',
            'Exclusive networking zone',
            'B2B speed dating sessions',
            'Official closing party (Nov 14)'
          ]
        },
        {
          id: 'pass-vip-1',
          user_id: userId,
          event_id: eventId,
          pass_type: 'vip',
          status: 'active',
          price_usd: 499.00,
          access_features: [
            'All conferences (Nov 12-14)',
            'Booth area access',
            'Exclusive networking zone',
            'B2B speed dating sessions',
            'Welcome cocktail (Nov 12)',
            'VIP area access',
            'Exclusive networking with speakers',
            'Exclusive networking with sponsors',
            'Exclusive networking with authorities',
            'Official closing party (Nov 14)'
          ]
        }
      ];

      // Insert demo passes
      const { data: insertedPasses, error: insertError } = await supabase
        .from('passes')
        .insert(demoPasses)
        .select();

      if (insertError) {
        console.error('Error inserting demo passes:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create demo passes' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        data: insertedPasses || demoPasses
      }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({
      data: userPasses
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (e) {
    console.error('User passes API error:', e);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
