-- ============================================================================
-- Trigger Function: notify_meeting_request_created
-- Purpose: Triggered AFTER INSERT on meeting_requests table
--          Validates the request, sends notifications, and updates pass usage
-- 
-- Note: NEW.speaker_id is UUID (user_id from bsl_speakers)
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_meeting_request_created() RETURNS TRIGGER AS $$
DECLARE
    can_request BOOLEAN;
    reason TEXT;
    user_pass_type pass_type;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
    existing_notification_id UUID;
    speaker_text_id TEXT;
    speaker_uuid_id UUID;  -- The UUID id from bsl_speakers
BEGIN
    -- NEW.speaker_id is UUID (user_id from bsl_speakers)
    -- We need to get the UUID id (not user_id) from bsl_speakers to pass to can_make_meeting_request
    -- First get the speaker's UUID id by looking up user_id
    SELECT id INTO speaker_uuid_id
    FROM public.bsl_speakers
    WHERE user_id = NEW.speaker_id
    LIMIT 1;
    
    -- Convert UUID id to TEXT for functions that expect TEXT speaker_id
    IF speaker_uuid_id IS NOT NULL THEN
        speaker_text_id := speaker_uuid_id::TEXT;
    ELSE
        -- Fallback: use the UUID as TEXT (shouldn't happen if data is correct)
        speaker_text_id := NEW.speaker_id::TEXT;
    END IF;
    
    -- Check if user can make meeting request (pass TEXT speaker_id)
    -- Note: can_make_meeting_request expects TEXT p_speaker_id (the UUID id from bsl_speakers, as TEXT)
    SELECT * INTO can_request, reason, user_pass_type, remaining_requests, remaining_boost
    FROM can_make_meeting_request(NEW.requester_id, speaker_text_id, COALESCE(NEW.boost_amount, 0));
    
    IF NOT can_request THEN
        -- Raise exception to prevent meeting request creation
        RAISE EXCEPTION 'Cannot create meeting request: %', reason;
    END IF;
    
    -- Update pass usage
    PERFORM update_pass_after_request(NEW.requester_id, COALESCE(NEW.boost_amount, 0));
    
    -- Check if "Request Sent" notification already exists for this meeting request
    SELECT id INTO existing_notification_id
    FROM notifications
    WHERE user_id = NEW.requester_id
      AND type = 'meeting_request'
      AND meeting_request_id = NEW.id
      AND created_at > NOW() - INTERVAL '1 hour'
    LIMIT 1;
    
    -- Send notification to requester (only if it doesn't already exist)
    IF existing_notification_id IS NULL THEN
        BEGIN
            PERFORM create_notification(
                NEW.requester_id,
                'meeting_request',
                'Request Sent ✓',
                'Your meeting request to ' || NEW.speaker_name || ' has been sent successfully.',
                NEW.id,
                speaker_text_id,  -- Use TEXT id for notifications
                false
            );
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING 'create_notification error: %', SQLERRM;
        END;
    END IF;
    
    -- Send prioritized notification to speaker (use TEXT id)
    BEGIN
        PERFORM send_prioritized_notification(
            speaker_text_id,  -- Use TEXT id
            NEW.requester_name,
            NEW.requester_company,
            NEW.requester_ticket_type,
            COALESCE(NEW.boost_amount, 0),
            NEW.id
        );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'send_prioritized_notification error: %', SQLERRM;
    END;
    
    -- Update request limits (if the function exists)
    BEGIN
        PERFORM update_request_limits_after_send(
            NEW.requester_id,
            'bsl2025', -- Event ID
            NEW.requester_ticket_type
        );
    EXCEPTION
        WHEN undefined_function THEN
            -- Function doesn't exist, skip this step
            NULL;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

