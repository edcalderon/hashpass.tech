-- Fix notification system to properly send notifications to both users and speakers
-- This migration ensures:
-- 1. Speakers with user_id get notifications when they receive requests
-- 2. Requesters get notifications when they send requests
-- 3. Both parties get notifications when requests are accepted

-- Create get_notification_priority function if it doesn't exist
CREATE OR REPLACE FUNCTION get_notification_priority(
    p_ticket_type TEXT,
    p_boost_amount DECIMAL
) RETURNS INTEGER AS $$
DECLARE
    priority_score INTEGER := 50; -- Default priority
BEGIN
    -- Base priority by ticket type
    IF p_ticket_type = 'vip' THEN
        priority_score := 80;
    ELSIF p_ticket_type = 'business' THEN
        priority_score := 60;
    ELSE
        priority_score := 50;
    END IF;
    
    -- Add boost bonus (each $1 of boost adds 1 point, max 20 points)
    IF p_boost_amount > 0 THEN
        priority_score := priority_score + LEAST(p_boost_amount::INTEGER, 20);
    END IF;
    
    RETURN priority_score;
END;
$$ LANGUAGE plpgsql;

-- Update send_prioritized_notification to actually create notifications for speakers with user_id
CREATE OR REPLACE FUNCTION send_prioritized_notification(
    p_speaker_id TEXT,
    p_requester_name TEXT,
    p_requester_company TEXT,
    p_ticket_type TEXT,
    p_boost_amount DECIMAL,
    p_meeting_request_id UUID
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
    priority_score INTEGER;
    notification_title TEXT;
    notification_message TEXT;
    speaker_user_id UUID;
BEGIN
    -- Calculate priority score
    priority_score := get_notification_priority(p_ticket_type, p_boost_amount);
    
    -- Create notification title and message based on priority
    IF p_ticket_type = 'vip' THEN
        notification_title := '🔥 VIP Meeting Request';
        notification_message := p_requester_name || ' (VIP) wants to meet with you';
    ELSIF p_ticket_type = 'business' THEN
        notification_title := '💼 Business Meeting Request';
        notification_message := p_requester_name || ' (Business) wants to meet with you';
    ELSE
        notification_title := '📋 Meeting Request';
        notification_message := p_requester_name || ' wants to meet with you';
    END IF;
    
    -- Add boost information if applicable
    IF p_boost_amount > 0 THEN
        notification_message := notification_message || ' (Boosted with $' || p_boost_amount || ' VOI)';
    END IF;
    
    -- Check if speaker has a user_id (linked to auth.users)
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = p_speaker_id;
    
    -- If speaker has a user_id, create notification for them
    IF speaker_user_id IS NOT NULL THEN
        -- Check if notification already exists to prevent duplicates
        SELECT id INTO notification_id
        FROM notifications
        WHERE user_id = speaker_user_id
          AND type = 'meeting_request'
          AND meeting_request_id = p_meeting_request_id
          AND created_at > NOW() - INTERVAL '1 hour'
        LIMIT 1;
        
        -- Only create if it doesn't exist
        IF notification_id IS NULL THEN
            notification_id := create_notification(
                speaker_user_id,
                'meeting_request',
                notification_title,
                notification_message,
                p_meeting_request_id,
                p_speaker_id,
                priority_score > 50  -- Mark as urgent if priority is high
            );
        END IF;
    ELSE
        -- Speaker doesn't have user_id, return dummy UUID
        notification_id := gen_random_uuid();
    END IF;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Update notify_meeting_request_created to send notification to requester
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
    
    -- Send prioritized notification to speaker (now works with TEXT speaker_id and creates actual notifications)
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

-- Update notify_meeting_status_change to also notify speaker when they accept/decline
CREATE OR REPLACE FUNCTION notify_meeting_status_change() RETURNS TRIGGER AS $$
DECLARE
    speaker_user_id UUID;
BEGIN
    IF OLD.status != NEW.status THEN
        -- Get speaker's user_id if they have one
        SELECT user_id INTO speaker_user_id
        FROM public.bsl_speakers
        WHERE id = NEW.speaker_id;
        
        -- Send notifications based on status change
        CASE NEW.status
            WHEN 'accepted' THEN
                -- Notify requester
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_accepted',
                    'Meeting Request Accepted! 🎉',
                    NEW.speaker_name || ' has accepted your meeting request',
                    NEW.id,
                    NEW.speaker_id,
                    true
                );
                
                -- Notify speaker (if they have user_id)
                IF speaker_user_id IS NOT NULL THEN
                    PERFORM create_notification(
                        speaker_user_id,
                        'meeting_accepted',
                        'Request Accepted',
                        'You have accepted the meeting request from ' || NEW.requester_name,
                        NEW.id,
                        NEW.speaker_id,
                        false
                    );
                END IF;
                
            WHEN 'declined' THEN
                -- Notify requester
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_declined',
                    'Meeting Request Declined',
                    NEW.speaker_name || ' has declined your meeting request. Your request and boost amount have been refunded.',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
                
                -- Notify speaker (if they have user_id)
                IF speaker_user_id IS NOT NULL THEN
                    PERFORM create_notification(
                        speaker_user_id,
                        'meeting_declined',
                        'Request Declined',
                        'You have declined the meeting request from ' || NEW.requester_name,
                        NEW.id,
                        NEW.speaker_id,
                        false
                    );
                END IF;
                
            WHEN 'expired' THEN
                -- Notify requester
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_expired',
                    'Meeting Request Expired',
                    'Your meeting request to ' || NEW.speaker_name || ' has expired. Your request and boost amount have been refunded.',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
                
            WHEN 'cancelled' THEN
                -- Notify requester (notification already sent by cancel_meeting_request function, but we can add a trigger notification if needed)
                -- The cancel_meeting_request function already handles notifications, so we can skip here
                -- or add a duplicate notification if desired
                NULL;
                
            ELSE
                -- For any other status changes, do nothing (prevents "case not found" error)
                NULL;
        END CASE;
        
        -- Update pass based on response (if function exists)
        BEGIN
            PERFORM update_pass_after_response(
                NEW.requester_id,
                NEW.id,
                NEW.status
            );
        EXCEPTION
            WHEN undefined_function THEN
                NULL;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

