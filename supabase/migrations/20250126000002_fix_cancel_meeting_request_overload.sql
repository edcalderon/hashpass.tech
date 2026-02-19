-- Drop the TEXT version of cancel_meeting_request to resolve function overloading conflict
DROP FUNCTION IF EXISTS public.cancel_meeting_request(p_request_id text, p_user_id text);

-- Ensure only the UUID version exists
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_request_id UUID,
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    user_pass RECORD;
    speaker_user_id UUID;
    request_id_uuid UUID;
    user_id_uuid UUID;
BEGIN
    -- Explicitly convert parameters to UUID to ensure type consistency
    request_id_uuid := p_request_id::UUID;
    user_id_uuid := p_user_id::UUID;
    
    -- Get the request and verify it belongs to the user
    -- Use explicit UUID casts to avoid type mismatch errors
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id::UUID = request_id_uuid
      AND requester_id::UUID = user_id_uuid;
    
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
    WHERE user_id::UUID = user_id_uuid
    AND event_id = 'bsl2025' 
    AND status = 'active'
    LIMIT 1;
    
    -- Update request to cancelled
    UPDATE meeting_requests
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id::UUID = request_id_uuid;
    
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
        user_id_uuid,
        'meeting_cancelled',
        'Meeting Request Cancelled',
        'You have cancelled your meeting request to ' || COALESCE(request_record.speaker_name, 'the speaker') || '. Your request limit has been restored, but boost points are not refunded.',
        request_id_uuid,
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
                COALESCE(request_record.requester_name, 'A user') || ' has cancelled their meeting request.',
                request_id_uuid,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION cancel_meeting_request(UUID, UUID) IS 'Cancels a meeting request. Restores request limit but does NOT refund boost points.';

