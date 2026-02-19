import { supabaseServer as supabase } from '@/lib/supabase-server';
import { getSpeakerCloudinaryAvatarUrl } from '@/lib/cloudinary';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, error, count } = await supabase
      .from('bsl_speakers')
      .select('*', { count: 'exact' })
      .range(from, to)
      .order('name', { ascending: true });

    if (error) {
      console.error('Speakers fetch error:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch speakers' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add Cloudinary URLs to speaker data
    const speakersWithCloudinary = (data || []).map(speaker => ({
      ...speaker,
      cloudinaryAvatarUrl: getSpeakerCloudinaryAvatarUrl(speaker.name, 200)
    }));

    return new Response(JSON.stringify({
      data: speakersWithCloudinary,
      page,
      pageSize,
      total: count || 0
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Unexpected server error:', error);
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), { status: 500 });
  }
}


