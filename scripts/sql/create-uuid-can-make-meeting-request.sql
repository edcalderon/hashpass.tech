-- Create UUID version of can_make_meeting_request function
-- This is needed for table triggers that pass UUID parameters

CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id uuid,
    p_speaker_id text,
    p_boost_amount numeric
)
RETURNS TABLE(
    can_request boolean,
    reason text,
    pass_type text,
    remaining_requests integer,
    remaining_boost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid uuid;
    pass_record RECORD;
    total_requests integer;
    total_boost numeric;
BEGIN
    -- Convert user_id to UUID if needed
    user_uuid := p_user_id;
    
    -- Get user's pass information
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = user_uuid::text 
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Check if user has an active pass
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'No active pass found', 'none'::text, 0, 0::numeric;
        RETURN;
    END IF;
    
    -- Check if pass is active
    IF pass_record.status != 'active' THEN
        RETURN QUERY SELECT false, 'Pass is not active', pass_record.pass_type, 0, 0::numeric;
        RETURN;
    END IF;
    
    -- Calculate remaining requests and boost
    total_requests := COALESCE(pass_record.max_meeting_requests, 0) - COALESCE(pass_record.used_meeting_requests, 0);
    total_boost := COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0);
    
    -- Check if user has remaining requests
    IF total_requests <= 0 THEN
        RETURN QUERY SELECT false, 'No remaining meeting requests', pass_record.pass_type, total_requests, total_boost;
        RETURN;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > total_boost THEN
        RETURN QUERY SELECT false, 'Insufficient boost amount', pass_record.pass_type, total_requests, total_boost;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, 'Request allowed', pass_record.pass_type, total_requests, total_boost;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION can_make_meeting_request(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(uuid,text,numeric) TO anon;
