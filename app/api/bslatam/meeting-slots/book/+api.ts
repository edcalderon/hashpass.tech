import { supabase } from '@/lib/supabase';

// Type for booking response
interface BookingResponse {
  success: boolean;
  message: string;
  meeting_id: string;
  slot_id: string;
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    // Get the auth token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No token provided' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { slotId, meetingId, location = 'Networking Area' } = await request.json();
    
    if (!slotId || !meetingId) {
      return new Response(JSON.stringify({ error: 'Slot ID and Meeting ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Book the slot
    const { data, error } = await supabase
      .rpc('book_meeting_slot', {
        slot_id: slotId,
        meeting_id: meetingId,
        location
      });

    if (error) throw error;
    
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error booking meeting slot:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
