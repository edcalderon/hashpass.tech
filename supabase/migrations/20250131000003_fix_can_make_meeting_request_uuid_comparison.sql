-- Fix can_make_meeting_request function
-- blocked_user_id is UUID, not TEXT, so we should compare directly
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
    -- blocked_user_id is UUID, so compare directly (no casting needed)
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id
    ) INTO is_blocked;
    
    IF is_blocked THEN
        RETURN QUERY SELECT false, 'User is blocked by this speaker', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get user's pass
    -- user_id in passes table is TEXT, so cast UUID to TEXT
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id::TEXT
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

