-- EMERGENCY FIX: Resolve 404 errors immediately
-- This script fixes the "operator does not exist: text = uuid" error

-- 1. Drop the problematic function
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);

-- 2. Create a robust function that handles both TEXT and UUID inputs
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id TEXT,  -- Accept TEXT input
    p_speaker_id TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type TEXT,
    remaining_requests INTEGER,
    remaining_boost DECIMAL(10,2)
) AS $$
DECLARE
    user_pass RECORD;
    existing_request RECORD;
    remaining_req INTEGER;
    remaining_boost DECIMAL(10,2);
    user_uuid UUID;
BEGIN
    -- Convert TEXT to UUID safely
    BEGIN
        user_uuid := p_user_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'Invalid user ID format' as reason,
            NULL::TEXT as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END;

    -- Check if user has an active pass - try both UUID and TEXT approaches
    SELECT 
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount
    INTO user_pass
    FROM public.passes p
    WHERE (p.user_id = user_uuid OR p.user_id::text = p_user_id)
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active'
    LIMIT 1;

    -- If no active pass found
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No active pass found' as reason,
            NULL::TEXT as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END IF;

    -- Check if there's already a pending or approved request to this speaker
    SELECT * INTO existing_request
    FROM public.meeting_requests mr
    WHERE (mr.requester_id = user_uuid OR mr.requester_id::text = p_user_id)
      AND mr.speaker_id = p_speaker_id 
      AND mr.status IN ('pending', 'approved')
    LIMIT 1;

    IF existing_request IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You already have a pending or approved request to this speaker' as reason,
            user_pass.pass_type::TEXT as pass_type,
            (user_pass.max_meeting_requests - user_pass.used_meeting_requests) as remaining_requests,
            (user_pass.max_boost_amount - user_pass.used_boost_amount) as remaining_boost;
        RETURN;
    END IF;

    -- Calculate remaining requests and boost
    remaining_req := user_pass.max_meeting_requests - user_pass.used_meeting_requests;
    remaining_boost := user_pass.max_boost_amount - user_pass.used_boost_amount;

    -- Check if user has enough requests left
    IF remaining_req <= 0 THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No meeting requests remaining' as reason,
            user_pass.pass_type::TEXT as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- All checks passed - user can make the request
    RETURN QUERY SELECT
        TRUE as can_request,
        'Request allowed' as reason,
        user_pass.pass_type::TEXT as pass_type,
        remaining_req as remaining_requests,
        remaining_boost as remaining_boost;
END;
$$ LANGUAGE plpgsql;

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(TEXT, TEXT, DECIMAL) TO authenticated;

-- 4. Test the function
SELECT 'Emergency fix applied - testing function...' as status;

-- Test with a valid UUID string
SELECT * FROM can_make_meeting_request('00000000-0000-0000-0000-000000000000', '550e8400-e29b-41d4-a716-446655440001', 0);

SELECT 'Emergency fix completed!' as status;

