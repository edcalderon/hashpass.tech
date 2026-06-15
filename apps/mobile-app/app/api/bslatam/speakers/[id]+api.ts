import { supabaseServer as supabase } from '@/lib/supabase-server';
import { getSpeakerCloudinaryAvatarUrl } from '@/lib/cloudinary';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing speaker id' }), { status: 400 });
  }
  const { data, error } = await supabase.from('bsl_speakers').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('Speaker fetch error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch speaker' }), { status: 500 });
  }
  if (!data) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }
  
  // Add Cloudinary URL to speaker data
  const speakerWithCloudinary = {
    ...data,
    cloudinaryAvatarUrl: getSpeakerCloudinaryAvatarUrl(data.name, 200)
  };
  
  return new Response(JSON.stringify(speakerWithCloudinary), { status: 200, headers: { 'Content-Type': 'application/json' } });
}


