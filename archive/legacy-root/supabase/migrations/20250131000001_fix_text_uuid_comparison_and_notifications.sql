-- Fix "operator does not exist: text = uuid" error
-- Ensure all comparisons between TEXT and UUID are properly cast
-- Also ensure notifications are sent to both users properly

-- Fix can_make_meeting_request function to handle blocked_user_id type correctly
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id UUID,
    p_speaker_id TEXT,
    p_boost_amount DECIMAL DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type pass_type,
    remaining_requests INTEGER,
    remaining_boost DECIMAL
) AS $$
DECLARE
    user_pass RECORD;
    limits RECORD;
    is_blocked BOOLEAN;
BEGIN
    -- Check if user is blocked by speaker
    -- Cast blocked_user_id to TEXT for comparison since it may be stored as TEXT
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id::TEXT = p_user_id::TEXT
    ) INTO is_blocked;
    
    IF is_blocked THEN
        RETURN QUERY SELECT false, 'User is blocked by this speaker', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT false, 'No active pass found', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(user_pass.pass_type);
    
    -- Check if user has remaining requests
    IF user_pass.used_meeting_requests >= user_pass.max_meeting_requests THEN
        RETURN QUERY SELECT false, 'No remaining meeting requests', user_pass.pass_type, 0, user_pass.max_boost_amount - user_pass.used_boost_amount;
        RETURN;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > 0 AND (user_pass.used_boost_amount + p_boost_amount) > user_pass.max_boost_amount THEN
        RETURN QUERY SELECT false, 'Insufficient boost amount', user_pass.pass_type, user_pass.max_meeting_requests - user_pass.used_meeting_requests, user_pass.max_boost_amount - user_pass.used_boost_amount;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT 
        true, 
        'Request allowed', 
        user_pass.pass_type,
        user_pass.max_meeting_requests - user_pass.used_meeting_requests,
        user_pass.max_boost_amount - user_pass.used_boost_amount;
END;
$$ LANGUAGE plpgsql;

-- Fix toggle_user_block function to handle type casting
CREATE OR REPLACE FUNCTION toggle_user_block(
    p_speaker_id TEXT,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    block_exists BOOLEAN;
BEGIN
    -- Check if block already exists (cast both to TEXT for comparison)
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id::TEXT = p_user_id::TEXT
    ) INTO block_exists;
    
    IF block_exists THEN
        -- Remove block
        DELETE FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id::TEXT = p_user_id::TEXT;
        RETURN false; -- User is now unblocked
    ELSE
        -- Add block (cast UUID to TEXT for storage)
        INSERT INTO user_blocks (speaker_id, blocked_user_id, reason)
        VALUES (p_speaker_id, p_user_id::TEXT, p_reason)
        ON CONFLICT (speaker_id, blocked_user_id) DO UPDATE
        SET reason = COALESCE(EXCLUDED.reason, user_blocks.reason);
        RETURN true; -- User is now blocked
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Ensure notify_meeting_request_created sends notifications to both users
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

-- Ensure send_prioritized_notification properly sends notifications to speakers with user_id
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

