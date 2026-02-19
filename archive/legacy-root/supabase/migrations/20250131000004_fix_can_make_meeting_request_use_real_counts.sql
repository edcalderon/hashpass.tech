-- Fix can_make_meeting_request to use real meeting request counts instead of used_meeting_requests
-- Ensure all return statements use proper type casting
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
    is_blocked BOOLEAN;
    total_requests INTEGER;
    remaining_req INTEGER;
BEGIN
    -- Check if user is blocked by speaker
    -- blocked_user_id is UUID, so compare directly (no casting needed)
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id
    ) INTO is_blocked;
    
    IF is_blocked THEN
        RETURN QUERY SELECT 
            false::BOOLEAN, 
            'User is blocked by this speaker'::TEXT, 
            NULL::pass_type, 
            0::INTEGER, 
            0.00::DECIMAL;
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
        RETURN QUERY SELECT 
            false::BOOLEAN, 
            'No active pass found'::TEXT, 
            NULL::pass_type, 
            0::INTEGER, 
            0.00::DECIMAL;
        RETURN;
    END IF;
    
    -- Count actual meeting requests from database
    SELECT COUNT(*) INTO total_requests
    FROM meeting_requests
    WHERE requester_id::text = p_user_id::text;
    
    -- Calculate remaining requests using actual count
    remaining_req := GREATEST(0, COALESCE(user_pass.max_meeting_requests, 0) - total_requests);
    
    -- Check if user has remaining requests
    IF remaining_req <= 0 THEN
        RETURN QUERY SELECT 
            false::BOOLEAN, 
            'No remaining meeting requests'::TEXT, 
            user_pass.pass_type::pass_type, 
            0::INTEGER, 
            GREATEST(0, COALESCE(user_pass.max_boost_amount, 0) - COALESCE(user_pass.used_boost_amount, 0))::DECIMAL;
        RETURN;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > 0 AND (COALESCE(user_pass.used_boost_amount, 0) + p_boost_amount) > COALESCE(user_pass.max_boost_amount, 0) THEN
        RETURN QUERY SELECT 
            false::BOOLEAN, 
            'Insufficient boost amount'::TEXT, 
            user_pass.pass_type::pass_type, 
            remaining_req::INTEGER, 
            GREATEST(0, COALESCE(user_pass.max_boost_amount, 0) - COALESCE(user_pass.used_boost_amount, 0))::DECIMAL;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT 
        true::BOOLEAN, 
        'Request allowed'::TEXT, 
        user_pass.pass_type::pass_type,
        remaining_req::INTEGER,
        GREATEST(0, COALESCE(user_pass.max_boost_amount, 0) - COALESCE(user_pass.used_boost_amount, 0))::DECIMAL;
END;
$$ LANGUAGE plpgsql;

