-- Fix notify_meeting_request_created to handle speaker_id type correctly
CREATE OR REPLACE FUNCTION notify_meeting_request_created() RETURNS TRIGGER AS $$
DECLARE
    can_request BOOLEAN;
    reason TEXT;
    user_pass_type pass_type;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
    existing_notification_id UUID;
    speaker_id_text TEXT;
BEGIN
    -- Convert speaker_id to TEXT for can_make_meeting_request
    -- Handle both UUID and TEXT types
    speaker_id_text := NEW.speaker_id::TEXT;
    
    -- Check if user can make meeting request
    SELECT * INTO can_request, reason, user_pass_type, remaining_requests, remaining_boost
    FROM can_make_meeting_request(NEW.requester_id, speaker_id_text, COALESCE(NEW.boost_amount, 0));
    
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
        PERFORM create_notification(
            NEW.requester_id,
            'meeting_request',
            'Request Sent ✓',
            'Your meeting request to ' || NEW.speaker_name || ' has been sent successfully.',
            NEW.id,
            speaker_id_text,  -- Use TEXT version
            false
        );
    END IF;
    
    -- Send prioritized notification to speaker (now works with TEXT speaker_id)
    PERFORM send_prioritized_notification(
        speaker_id_text,  -- Use TEXT version
        NEW.requester_name,
        NEW.requester_company,
        NEW.requester_ticket_type,
        COALESCE(NEW.boost_amount, 0),
        NEW.id
    );
    
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

