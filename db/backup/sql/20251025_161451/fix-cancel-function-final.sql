-- Final fix for cancel_meeting_request function
-- This handles the UUID/TEXT type mismatch properly

-- Drop the existing function
DROP FUNCTION IF EXISTS cancel_meeting_request(text, text);

-- Create a new function that properly handles UUID types
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
    user_uuid uuid;
    request_uuid uuid;
BEGIN
    -- Convert text parameters to UUID for proper comparison
    BEGIN
        user_uuid := p_user_id::uuid;
        request_uuid := p_request_id::uuid;
    EXCEPTION
        WHEN invalid_text_representation THEN
            result := json_build_object(
                'success', false,
                'error', 'Invalid ID format',
                'message', 'The provided IDs are not valid UUIDs'
            );
            RETURN result;
    END;
    
    -- First, verify the request exists and belongs to the user
    -- Use UUID comparison for proper type matching
    SELECT mr.id, mr.requester_id, mr.speaker_id, mr.status
    INTO request_record
    FROM public.meeting_requests mr
    WHERE mr.id = request_uuid
      AND mr.requester_id = user_uuid
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
    
    -- Update the request status to cancelled using UUID comparison
    UPDATE public.meeting_requests 
    SET 
        status = 'cancelled',
        updated_at = NOW()
    WHERE id = request_uuid
      AND requester_id = user_uuid;
    
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
SELECT 'Cancel meeting request function created with proper UUID handling' as status;
