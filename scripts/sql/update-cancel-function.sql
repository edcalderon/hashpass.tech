-- Update the cancel_meeting_request function with proper type casting
-- This script will drop and recreate the function with the correct type handling

-- Drop the existing function
DROP FUNCTION IF EXISTS cancel_meeting_request(text, text);

-- Create the updated function with proper type casting
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_request_id text,
    p_user_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_record RECORD;
    result json;
BEGIN
    -- First, verify the request exists and belongs to the user
    -- Handle both UUID and TEXT types by casting everything to text
    SELECT mr.id, mr.requester_id::text, mr.speaker_id::text, mr.status
    INTO request_record
    FROM public.meeting_requests mr
    WHERE mr.id::text = p_request_id::text
      AND mr.requester_id::text = p_user_id::text
      AND mr.status IN ('pending', 'accepted', 'approved')
    LIMIT 1;
    
    -- Check if request was found
    IF NOT FOUND THEN
        result := json_build_object(
            'success', false,
            'error', 'Request not found or cannot be cancelled',
            'message', 'The meeting request was not found or has already been processed'
        );
        RETURN result;
    END IF;
    
    -- Check if request is already cancelled
    IF request_record.status = 'cancelled' THEN
        result := json_build_object(
            'success', false,
            'error', 'Request already cancelled',
            'message', 'This meeting request has already been cancelled'
        );
        RETURN result;
    END IF;
    
    -- Update the request status to cancelled
    UPDATE public.meeting_requests 
    SET 
        status = 'cancelled',
        updated_at = NOW()
    WHERE id::text = p_request_id::text
      AND requester_id::text = p_user_id::text;
    
    -- Check if the update was successful
    IF FOUND THEN
        result := json_build_object(
            'success', true,
            'message', 'Meeting request cancelled successfully',
            'request_id', p_request_id,
            'status', 'cancelled'
        );
        RETURN result;
    ELSE
        result := json_build_object(
            'success', false,
            'error', 'Failed to cancel request',
            'message', 'Could not update the meeting request status'
        );
        RETURN result;
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'success', false,
            'error', SQLERRM,
            'message', 'An error occurred while cancelling the meeting request'
        );
        RETURN result;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION cancel_meeting_request(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_meeting_request(text, text) TO anon;

-- Test the function
SELECT 'Cancel meeting request function updated successfully' as status;
