-- Integrate Pass System with Meeting Requests
-- Update triggers to work with pass validation and updates

-- Update the meeting request creation trigger to validate passes
CREATE OR REPLACE FUNCTION notify_meeting_request_created() RETURNS TRIGGER AS $$
DECLARE
    can_request BOOLEAN;
    reason TEXT;
    user_pass_type pass_type;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
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

-- Update the meeting status change trigger to update passes
CREATE OR REPLACE FUNCTION notify_meeting_status_change() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        -- Update pass based on response
        PERFORM update_pass_after_response(
            NEW.requester_id,
            NEW.id,
            NEW.status
        );
        
        -- Send notifications
        CASE NEW.status
            WHEN 'accepted' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_accepted',
                    'Meeting Request Accepted! 🎉',
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
                    NEW.speaker_name || ' has declined your meeting request. Your request and boost amount have been refunded.',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
            WHEN 'expired' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_expired',
                    'Meeting Request Expired',
                    'Your meeting request to ' || NEW.speaker_name || ' has expired. Your request and boost amount have been refunded.',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create default passes for users
CREATE OR REPLACE FUNCTION create_default_pass(
    p_user_id UUID,
    p_pass_type pass_type DEFAULT 'general'
) RETURNS TEXT AS $$
DECLARE
    pass_id TEXT;
    limits RECORD;
BEGIN
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(p_pass_type);
    
    -- Create pass
    INSERT INTO passes (
        user_id,
        event_id,
        pass_type,
        status,
        pass_number,
        max_meeting_requests,
        max_boost_amount,
        access_features,
        special_perks
    ) VALUES (
        p_user_id,
        'bsl2025',
        p_pass_type,
        'active',
        'BSL2025-' || p_pass_type::text || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
        limits.max_requests,
        limits.max_boost,
        CASE p_pass_type
            WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
            WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
            ELSE ARRAY['general_sessions']
        END,
        CASE p_pass_type
            WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
            WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
            ELSE ARRAY['basic_swag']
        END
    ) RETURNING id INTO pass_id;
    
    RETURN pass_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's pass information
CREATE OR REPLACE FUNCTION get_user_pass_info(p_user_id UUID)
RETURNS TABLE(
    pass_id TEXT,
    pass_type pass_type,
    status pass_status,
    pass_number TEXT,
    max_requests INTEGER,
    used_requests INTEGER,
    remaining_requests INTEGER,
    max_boost DECIMAL,
    used_boost DECIMAL,
    remaining_boost DECIMAL,
    access_features TEXT[],
    special_perks TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.pass_type,
        p.status,
        p.pass_number,
        p.max_meeting_requests,
        p.used_meeting_requests,
        (p.max_meeting_requests - p.used_meeting_requests),
        p.max_boost_amount,
        p.used_boost_amount,
        (p.max_boost_amount - p.used_boost_amount),
        p.access_features,
        p.special_perks
    FROM passes p
    WHERE p.user_id = p_user_id 
    AND p.event_id = 'bsl2025' 
    AND p.status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Function to block/unblock user
CREATE OR REPLACE FUNCTION toggle_user_block(
    p_speaker_id TEXT,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    block_exists BOOLEAN;
BEGIN
    -- Check if block already exists
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id
    ) INTO block_exists;
    
    IF block_exists THEN
        -- Remove block
        DELETE FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id;
        RETURN false; -- User is now unblocked
    ELSE
        -- Add block
        INSERT INTO user_blocks (speaker_id, blocked_user_id, reason)
        VALUES (p_speaker_id, p_user_id, p_reason);
        RETURN true; -- User is now blocked
    END IF;
END;
$$ LANGUAGE plpgsql;
