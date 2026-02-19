-- Quick fix for get_meeting_requests_for_speaker function
-- Fixes the type mismatch error: "Returned type text does not match expected type uuid in column 3"

-- Drop the existing function
DROP FUNCTION IF EXISTS get_meeting_requests_for_speaker(text,text);

-- Create the corrected function with proper return types
CREATE OR REPLACE FUNCTION get_meeting_requests_for_speaker(
    p_user_id text,
    p_speaker_id text
)
RETURNS TABLE(
    id uuid,
    requester_id uuid,
    speaker_id text,  -- Changed from uuid to text to match actual column type
    speaker_name text,
    requester_name text,
    requester_company text,
    requester_title text,
    requester_ticket_type text,
    meeting_type text,
    message text,
    boost_amount numeric,
    duration_minutes integer,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.id,
        mr.requester_id,
        mr.speaker_id::text,  -- Explicitly cast to text
        mr.speaker_name,
        mr.requester_name,
        mr.requester_company,
        mr.requester_title,
        mr.requester_ticket_type,
        mr.meeting_type,
        mr.message,
        mr.boost_amount,
        mr.duration_minutes,
        mr.status,
        mr.created_at,
        mr.updated_at,
        mr.expires_at
    FROM public.meeting_requests mr
    WHERE mr.requester_id::text = p_user_id
      AND mr.speaker_id::text = p_speaker_id
      AND mr.status != 'cancelled'
    ORDER BY mr.created_at DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text,text) TO anon;
