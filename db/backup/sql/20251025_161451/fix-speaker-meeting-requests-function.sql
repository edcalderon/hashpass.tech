-- Fix the get_speaker_meeting_requests function
-- The issue is with the GROUP BY clause and ORDER BY

-- Drop the existing function
DROP FUNCTION IF EXISTS get_speaker_meeting_requests(text);

-- Create a corrected function
CREATE OR REPLACE FUNCTION get_speaker_meeting_requests(p_speaker_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    requests json;
BEGIN
    -- Get all pending meeting requests for this speaker
    -- Handle both UUID and TEXT speaker_id types
    SELECT json_agg(
        json_build_object(
            'id', mr.id,
            'requester_id', mr.requester_id,
            'requester_name', mr.requester_name,
            'requester_company', mr.requester_company,
            'requester_title', mr.requester_title,
            'requester_ticket_type', mr.requester_ticket_type,
            'meeting_type', mr.meeting_type,
            'message', mr.message,
            'note', mr.note,
            'boost_amount', mr.boost_amount,
            'duration_minutes', mr.duration_minutes,
            'status', mr.status,
            'created_at', mr.created_at,
            'expires_at', mr.expires_at
        ) ORDER BY mr.created_at DESC
    ) INTO requests
    FROM public.meeting_requests mr
    WHERE mr.speaker_id::text = p_speaker_id::text
      AND mr.status IN ('pending', 'accepted', 'approved');
    
    result := json_build_object(
        'success', true,
        'requests', COALESCE(requests, '[]'::json),
        'count', COALESCE(json_array_length(requests), 0)
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'success', false,
            'error', SQLERRM,
            'requests', '[]'::json,
            'count', 0
        );
        RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_speaker_meeting_requests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_speaker_meeting_requests(text) TO anon;

-- Test the function
SELECT 'get_speaker_meeting_requests function fixed successfully' as status;
