import { supabase } from '@/lib/supabase';
import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { sendBookingEmail } from '@/lib/email';

export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!rateLimitOk(`patch-booking:${ip}`)) {
      return Response.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Booking ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || !['accepted', 'rejected', 'cancelled'].includes(body.status)) {
      return Response.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Start a transaction to update both booking and slot status
    const { data: booking, error: bookingError } = await supabase.rpc('handle_booking_status_change', {
      booking_id: id,
      new_status: body.status,
      user_id: user.id
    });

    if (bookingError) throw bookingError;
    if (!booking) {
      return Response.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Send notification email
    try {
      await sendBookingEmail(booking.attendee_email, body.status, {
        start: booking.start_time,
        location: booking.location || 'Networking Area'
      });
    } catch (emailError) {
      console.error('Failed to send booking email:', emailError);
      // Continue even if email fails
    }

    // Log the status change
    try {
      await supabase.from('BSL_Audit').insert({
        event: 'booking_status_changed',
        ref_id: id,
        metadata: { 
          status: body.status,
          updated_by: user.id
        }
      });
    } catch (auditError) {
      console.error('Failed to log booking status change:', auditError);
      // Continue even if audit log fails
    }

    return Response.json({ data: booking });
  } catch (error) {
    console.error('Error updating booking:', error);
    return Response.json(
      { error: 'Failed to update booking' },
      { status: 500 }
    );
  }
}

// GET /api/bslatam/bookings/[id] - Get booking details
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!params.id) {
      return new Response(
        JSON.stringify({ error: 'Booking ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get booking with related slot and user info
    const { data: booking, error } = await supabase
      .from('meetings')
      .select(`
        *,
        slot:meeting_slots(*),
        host:profiles!meetings_host_id_fkey(id, full_name, avatar_url, company),
        attendee:profiles!meetings_attendee_id_fkey(id, full_name, avatar_url, company)
      `)
      .eq('id', params.id)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return Response.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to view this booking
    if (booking.host_id !== user.id && booking.attendee_id !== user.id) {
      return Response.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    return Response.json({ data: booking });
  } catch (error) {
    console.error('Error fetching booking:', error);
    return Response.json(
      { error: 'Failed to fetch booking' },
      { status: 500 }
    );
  }
}

// DELETE /api/bslatam/bookings/[id] - Cancel a booking
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return Response.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!params.id) {
      return new Response(
        JSON.stringify({ error: 'Booking ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // First, get the booking to verify ownership
    const { data: booking, error: fetchError } = await supabase
      .from('meetings')
      .select('id, host_id, attendee_id, status, slot_id')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!booking) {
      return Response.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Check if user has permission to cancel this booking
    if (booking.host_id !== user.id && booking.attendee_id !== user.id) {
      return Response.json(
        { error: 'Not authorized to cancel this booking' },
        { status: 403 }
      );
    }

    // Start a transaction to update both booking and slot status
    const { data, error } = await supabase.rpc('handle_booking_status_change', {
      booking_id: params.id,
      new_status: 'cancelled',
      user_id: user.id
    });

    if (error) throw error;

    // Log the cancellation
    try {
      await supabase.from('BSL_Audit').insert({
        event: 'booking_cancelled',
        ref_id: params.id,
        metadata: { 
          cancelled_by: user.id,
          previous_status: booking.status
        }
      });
    } catch (auditError) {
      console.error('Failed to log booking cancellation:', auditError);
      // Continue even if audit log fails
    }

    return Response.json({ 
      success: true,
      message: 'Booking cancelled successfully',
      data 
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return Response.json(
      { error: 'Failed to cancel booking' },
      { status: 500 }
    );
  }
}


