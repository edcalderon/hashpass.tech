-- Function to cancel a meeting request (for requesters)
-- Restores request limit but does NOT refund boost points
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_request_id UUID,
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    user_pass RECORD;
    speaker_user_id UUID;
BEGIN
    -- Get the request and verify it belongs to the user
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND requester_id = p_user_id;
    
    -- Check if request was found
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Request not found or you do not have permission to cancel it'
        );
    END IF;
    
    -- Check if request can be cancelled (only pending/requested requests can be cancelled)
    IF request_record.status NOT IN ('pending', 'requested') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This request cannot be cancelled. Only pending requests can be cancelled.'
        );
    END IF;
    
    -- Get user's pass to restore request limit
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active'
    LIMIT 1;
    
    -- Update request to cancelled
    UPDATE meeting_requests
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Restore request limit (but NOT boost points)
    IF user_pass IS NOT NULL THEN
        UPDATE passes 
        SET 
            used_meeting_requests = GREATEST(0, used_meeting_requests - 1),
            updated_at = NOW()
        WHERE id = user_pass.id;
    END IF;
    
    -- Send notification to requester
    PERFORM create_notification(
        p_user_id,
        'meeting_cancelled',
        'Meeting Request Cancelled',
        'You have cancelled your meeting request to ' || request_record.speaker_name || '. Your request limit has been restored, but boost points are not refunded.',
        p_request_id,
        request_record.speaker_id,
        false
    );
    
    -- Send notification to speaker (if they have a user_id)
    BEGIN
        SELECT user_id INTO speaker_user_id
        FROM bsl_speakers
        WHERE id = request_record.speaker_id
        LIMIT 1;
        
        IF speaker_user_id IS NOT NULL THEN
            PERFORM create_notification(
                speaker_user_id,
                'meeting_cancelled',
                'Meeting Request Cancelled',
                request_record.requester_name || ' has cancelled their meeting request.',
                p_request_id,
                request_record.speaker_id,
                false
            );
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Ignore errors if speaker doesn't have user_id
            NULL;
    END;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request cancelled successfully'
    );
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION cancel_meeting_request(UUID, UUID) IS 'Cancels a meeting request. Restores request limit but does NOT refund boost points.';

