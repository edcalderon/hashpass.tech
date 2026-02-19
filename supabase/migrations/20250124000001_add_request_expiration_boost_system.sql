-- Add expiration and boost system for meeting requests
-- Base expiration: 2 hours
-- Boost: 50 points = +1 hour
-- Maximum expiration: 6 hours (max 4 hours boost = 200 points)

-- Function to calculate expiration time based on boost amount
CREATE OR REPLACE FUNCTION calculate_request_expiration(
    p_boost_amount DECIMAL DEFAULT 0
) RETURNS TIMESTAMPTZ AS $$
DECLARE
    base_hours INTEGER := 2; -- Base expiration: 2 hours
    boost_hours DECIMAL;
    total_hours DECIMAL;
    max_hours INTEGER := 6; -- Maximum expiration: 6 hours
BEGIN
    -- Calculate boost hours: 50 points = 1 hour
    -- Round down to nearest hour
    boost_hours := FLOOR(p_boost_amount / 50.0);
    
    -- Calculate total hours (base + boost)
    total_hours := base_hours + boost_hours;
    
    -- Cap at maximum hours
    IF total_hours > max_hours THEN
        total_hours := max_hours;
    END IF;
    
    -- Return expiration timestamp
    RETURN NOW() + (total_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to get boost level from boost amount
CREATE OR REPLACE FUNCTION get_boost_level(
    p_boost_amount DECIMAL
) RETURNS INTEGER AS $$
DECLARE
    boost_hours DECIMAL;
    max_boost_hours INTEGER := 4; -- Maximum boost: 4 hours (200 points)
BEGIN
    -- Calculate boost hours: 50 points = 1 hour
    boost_hours := FLOOR(p_boost_amount / 50.0);
    
    -- Cap at maximum boost hours
    IF boost_hours > max_boost_hours THEN
        boost_hours := max_boost_hours;
    END IF;
    
    RETURN boost_hours::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Update insert_meeting_request function to use calculated expiration
-- First, let's check if the function exists and get its signature
DO $$
BEGIN
    -- Update expires_at calculation in the trigger or function
    -- This will be handled in the notify_meeting_request_created trigger
    NULL;
END $$;

-- Update notify_meeting_request_created to set expiration based on boost
CREATE OR REPLACE FUNCTION notify_meeting_request_created() RETURNS TRIGGER AS $$
DECLARE
    can_request BOOLEAN;
    reason TEXT;
    user_pass_type pass_type;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
    existing_notification_id UUID;
    calculated_expires_at TIMESTAMPTZ;
BEGIN
    -- Check if user can make meeting request
    SELECT * INTO can_request, reason, user_pass_type, remaining_requests, remaining_boost
    FROM can_make_meeting_request(NEW.requester_id, NEW.speaker_id, NEW.boost_amount);
    
    IF NOT can_request THEN
        -- Raise exception to prevent meeting request creation
        RAISE EXCEPTION 'Cannot create meeting request: %', reason;
    END IF;
    
    -- Calculate expiration time based on boost
    calculated_expires_at := calculate_request_expiration(NEW.boost_amount);
    
    -- Always update expiration to match boost calculation
    -- This ensures consistency even if expires_at was set manually
    UPDATE meeting_requests
    SET expires_at = calculated_expires_at
    WHERE id = NEW.id;
    
    -- Update NEW record for trigger continuation
    NEW.expires_at := calculated_expires_at;
    
    -- Update pass usage (deduct boost points)
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
            'Your meeting request to ' || NEW.speaker_name || ' has been sent successfully. Expires in ' || 
            EXTRACT(EPOCH FROM (calculated_expires_at - NOW())) / 3600 || ' hours.',
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

-- Function to accept a meeting request (for speakers)
CREATE OR REPLACE FUNCTION accept_meeting_request(
    p_request_id UUID,
    p_speaker_id TEXT,
    p_speaker_response TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    result JSON;
BEGIN
    -- Get the request
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id = p_speaker_id
      AND status = 'pending';
    
    -- Check if request was found
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Request not found or already processed'
        );
    END IF;
    
    -- Check if request has expired
    IF request_record.expires_at < NOW() THEN
        -- Update to expired status
        UPDATE meeting_requests
        SET status = 'expired',
            updated_at = NOW()
        WHERE id = p_request_id;
        
        RETURN json_build_object(
            'success', false,
            'error', 'This request has expired'
        );
    END IF;
    
    -- Update request to accepted
    UPDATE meeting_requests
    SET status = 'accepted',
        speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
        speaker_response_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request accepted successfully'
    );
END;
$$ LANGUAGE plpgsql;

-- Function to decline a meeting request (for speakers)
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
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id = p_speaker_id
      AND status = 'pending';
    
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
$$ LANGUAGE plpgsql;

-- Function to block user and decline their request (for speakers)
CREATE OR REPLACE FUNCTION block_user_and_decline_request(
    p_request_id UUID,
    p_speaker_id TEXT,
    p_user_id UUID,
    p_reason TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    block_exists BOOLEAN;
    result JSON;
BEGIN
    -- Get the request
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id = p_speaker_id
      AND requester_id = p_user_id;
    
    -- Check if request was found
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Request not found'
        );
    END IF;
    
    -- Check if user is already blocked
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id::text
    ) INTO block_exists;
    
    -- Block the user if not already blocked
    IF NOT block_exists THEN
        INSERT INTO user_blocks (speaker_id, blocked_user_id, reason, blocked_at)
        VALUES (p_speaker_id, p_user_id::text, p_reason, NOW())
        ON CONFLICT (speaker_id, blocked_user_id) DO UPDATE
        SET reason = COALESCE(EXCLUDED.reason, user_blocks.reason),
            blocked_at = NOW();
    END IF;
    
    -- Decline the request if it's still pending
    IF request_record.status = 'pending' THEN
        UPDATE meeting_requests
        SET status = 'declined',
            speaker_response = COALESCE(p_reason, 'User has been blocked'),
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
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'message', 'User blocked and request declined'
    );
END;
$$ LANGUAGE plpgsql;

-- Add index on expires_at for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_meeting_requests_expires_at ON meeting_requests(expires_at) 
WHERE status = 'pending';

-- Function to expire old requests (should be called periodically)
CREATE OR REPLACE FUNCTION expire_old_meeting_requests() RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE meeting_requests
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'pending'
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Refund boost points for expired requests
    -- This would be handled by update_pass_after_response if it exists
    -- For now, we'll just update the status
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

