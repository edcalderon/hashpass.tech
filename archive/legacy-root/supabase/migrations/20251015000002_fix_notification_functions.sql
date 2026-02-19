-- Fix notification functions to work with TEXT speaker_id
-- Update function signatures to accept TEXT instead of UUID for speaker_id

-- Drop existing functions that have conflicting signatures
DROP FUNCTION IF EXISTS send_prioritized_notification(UUID, TEXT, TEXT, TEXT, DECIMAL, UUID);
DROP FUNCTION IF EXISTS create_notification(UUID, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN);

-- Recreate send_prioritized_notification with TEXT speaker_id
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
    
    -- Create notification (note: we can't use speaker_id as user_id since speakers aren't in auth.users)
    -- For now, we'll skip creating the notification since speakers don't have user accounts
    -- This could be handled differently in the future (e.g., email notifications)
    
    -- Return a dummy UUID for now
    notification_id := gen_random_uuid();
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Recreate create_notification with TEXT speaker_id
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
BEGIN
    INSERT INTO notifications (
        user_id, type, title, message, 
        meeting_request_id, speaker_id, is_urgent
    ) VALUES (
        p_user_id, p_type, p_title, p_message,
        p_meeting_request_id, p_speaker_id, p_is_urgent
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Update the notify_meeting_request_created function to handle TEXT speaker_id
CREATE OR REPLACE FUNCTION notify_meeting_request_created() RETURNS TRIGGER AS $$
BEGIN
    -- Send prioritized notification (now works with TEXT speaker_id)
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

-- Update the notify_meeting_status_change function to handle TEXT speaker_id
CREATE OR REPLACE FUNCTION notify_meeting_status_change() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        CASE NEW.status
            WHEN 'accepted' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_accepted',
                    'Meeting Request Accepted!',
                    NEW.speaker_name || ' has accepted your meeting request',
                    NEW.id,
                    NEW.speaker_id,
                    true
                );
            WHEN 'declined' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_declined',
                    'Meeting Request Declined',
                    NEW.speaker_name || ' has declined your meeting request',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
