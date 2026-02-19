-- Fix update_pass_after_request to handle UUID correctly
CREATE OR REPLACE FUNCTION update_pass_after_request(
    p_user_id UUID,
    p_boost_amount DECIMAL DEFAULT 0
) RETURNS BOOLEAN AS $$
DECLARE
    user_pass RECORD;
BEGIN
    -- Get user's pass
    -- user_id in passes table is TEXT, so cast UUID to TEXT
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id::TEXT
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update pass usage
    UPDATE passes 
    SET 
        used_meeting_requests = COALESCE(used_meeting_requests, 0) + 1,
        used_boost_amount = COALESCE(used_boost_amount, 0) + p_boost_amount,
        updated_at = NOW()
    WHERE id = user_pass.id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

