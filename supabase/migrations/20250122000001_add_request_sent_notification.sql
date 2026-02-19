-- Add "Request Sent" notification for requester when meeting request is created
-- Also prevent duplicate notifications by checking if one already exists

-- Update the create_notification function to check for duplicates
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_meeting_request_id UUID DEFAULT NULL,
    p_speaker_id TEXT DEFAULT NULL,
    p_is_urgent BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
    existing_notification_id UUID;
BEGIN
    -- Check if a notification with the same content already exists
    -- This prevents duplicate notifications for the same meeting request
    IF p_meeting_request_id IS NOT NULL THEN
        SELECT id INTO existing_notification_id
        FROM notifications
        WHERE user_id = p_user_id
          AND type = p_type
          AND meeting_request_id = p_meeting_request_id
          AND created_at > NOW() - INTERVAL '1 hour'  -- Only check recent notifications (within last hour)
        LIMIT 1;
        
        -- If notification already exists, return its ID instead of creating a new one
        IF existing_notification_id IS NOT NULL THEN
            RETURN existing_notification_id;
        END IF;
    END IF;
    
    -- Create new notification
    INSERT INTO notifications (
        user_id, type, title, message, 
        meeting_request_id, speaker_id, is_urgent, is_archived
    ) VALUES (
        p_user_id, p_type, p_title, p_message,
        p_meeting_request_id, p_speaker_id, p_is_urgent, false
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Update the notify_meeting_request_created function to send notification to requester
CREATE OR REPLACE FUNCTION notify_meeting_request_created() RETURNS TRIGGER AS $$
DECLARE
    can_request BOOLEAN;
    reason TEXT;
    user_pass_type pass_type;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
    existing_notification_id UUID;
BEGIN
    -- Check if user can make meeting request
    SELECT * INTO can_request, reason, user_pass_type, remaining_requests, remaining_boost
    FROM can_make_meeting_request(NEW.requester_id, NEW.speaker_id, NEW.boost_amount);
    
    IF NOT can_request THEN
        -- Raise exception to prevent meeting request creation
        RAISE EXCEPTION 'Cannot create meeting request: %', reason;
    END IF;
    
    -- Update pass usage
    PERFORM update_pass_after_request(NEW.requester_id, NEW.boost_amount);
    
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
            NEW.speaker_id,
            false
        );
    END IF;
    
    -- Send prioritized notification to speaker (now works with TEXT speaker_id)
    PERFORM send_prioritized_notification(
        NEW.speaker_id,
        NEW.requester_name,
        NEW.requester_company,
        NEW.requester_ticket_type,
        NEW.boost_amount,
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

