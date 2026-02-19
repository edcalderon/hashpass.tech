-- Simple meeting request functions that work with any column type

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.cancel_meeting_request(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_meeting_request_status(TEXT, TEXT);

-- Create simple function to get meeting request status
CREATE OR REPLACE FUNCTION public.get_meeting_request_status(
    p_user_id TEXT,
    p_speaker_id TEXT
) RETURNS TABLE(
    id TEXT,
    requester_id TEXT,
    speaker_id TEXT,
    speaker_name TEXT,
    requester_name TEXT,
    requester_company TEXT,
    requester_title TEXT,
    requester_ticket_type TEXT,
    meeting_type TEXT,
    message TEXT,
    note TEXT,
    boost_amount DECIMAL(10,2),
    duration_minutes INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    -- Simple approach: cast everything to text for comparison
    RETURN QUERY 
    SELECT 
        mr.id::text,
        mr.requester_id::text,
        mr.speaker_id::text,
        mr.speaker_name,
        mr.requester_name,
        mr.requester_company,
        mr.requester_title,
        mr.requester_ticket_type,
        mr.meeting_type,
        mr.message,
        mr.note,
        mr.boost_amount,
        mr.duration_minutes,
        mr.status,
        mr.created_at,
        mr.updated_at,
        mr.expires_at
    FROM public.meeting_requests mr
    WHERE mr.requester_id::text = p_user_id
      AND mr.speaker_id::text = p_speaker_id
      AND mr.status IN ('pending', 'approved', 'declined', 'cancelled')
    ORDER BY mr.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create simple function to cancel a meeting request
CREATE OR REPLACE FUNCTION public.cancel_meeting_request(
    p_user_id TEXT,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    -- Simple approach: cast everything to text for comparison
    UPDATE public.meeting_requests 
    SET status = 'cancelled', updated_at = NOW()
    WHERE id::text = p_request_id
      AND requester_id::text = p_user_id
      AND status = 'pending';
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql;
