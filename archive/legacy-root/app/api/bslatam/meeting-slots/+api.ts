
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Type definitions for the API response
interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

// Type for meeting slot
interface MeetingSlot {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  status: 'available' | 'booked' | 'unavailable';
  meeting_id: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/bslatam/meeting-slots?userId=xxx - Get available slots for a user
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    
    // Validate user ID
    if (!targetUserId || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(targetUserId)) {
      return new Response(
        JSON.stringify({ 
          error: 'Valid user ID is required',
          details: 'User ID must be a valid UUID'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Set default date range: now to 7 days from now
    const now = new Date();
    const defaultEndDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Parse dates, using defaults if not provided
    const startDate = startDateParam ? new Date(startDateParam) : now;
    const endDate = endDateParam ? new Date(endDateParam) : defaultEndDate;

    // Get available slots
    const { data: slots, error } = await supabase
      .from('meeting_slots')
      .select('*')
      .eq('user_id', targetUserId)
      .gte('start_time', startDate.toISOString())
      .lte('end_time', endDate.toISOString())
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Database error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }

    console.log('Successfully retrieved slots:', slots);
    return new Response(JSON.stringify({ data: slots }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching meeting slots:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? error.stack : String(error);
    
    console.error('Error details:', { errorMessage, errorDetails });
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch meeting slots',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorDetails : undefined
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST /api/bslatam/meeting-slots - Generate weekly slots for current user
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const userId = body.userId;
    const startDate = body.startDate || new Date().toISOString().split('T')[0];

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Call the stored procedure to generate slots
    const { data, error } = await supabase.rpc('generate_weekly_slots', {
      user_uuid: userId,
      start_date: startDate
    });

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    return new Response(JSON.stringify({ 
      message: 'Weekly slots generated successfully',
      data 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error generating weekly slots:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate weekly slots' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
