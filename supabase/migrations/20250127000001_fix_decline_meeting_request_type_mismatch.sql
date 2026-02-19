-- Fix type mismatch in decline_meeting_request function
-- The speaker_id column may be UUID or TEXT depending on migration state
-- This fix ensures the comparison works regardless of the column type

CREATE OR REPLACE FUNCTION decline_meeting_request(
    p_request_id UUID,
    p_speaker_id TEXT,
    p_speaker_response TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    result JSON;
BEGIN
    -- Get the request
    -- Cast speaker_id to TEXT for comparison to handle both UUID and TEXT column types
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id::TEXT = p_speaker_id
      AND status IN ('pending', 'requested');
    
    -- Check if request was found
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Request not found or already processed'
        );
    END IF;
    
    -- Update request to declined
    UPDATE meeting_requests
    SET status = 'declined',
        speaker_response = COALESCE(p_speaker_response, 'Meeting request declined'),
        speaker_response_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Refund boost points to requester (if any)
    IF request_record.boost_amount > 0 THEN
        BEGIN
            PERFORM update_pass_after_response(
                request_record.requester_id,
                p_request_id,
                'declined'
            );
        EXCEPTION
            WHEN undefined_function THEN
                NULL;
        END;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request declined'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

