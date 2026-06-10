-- Fix the type casting issue in meeting_requests table
-- The issue is likely in the meeting_requests table where user_id is TEXT but we're comparing with UUID

-- First, let's check if there are any type mismatches in the meeting_requests table
-- and fix the can_make_meeting_request function to handle this properly

CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id UUID,
    p_speaker_id TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type pass_type,
    remaining_requests INTEGER,
    remaining_boost DECIMAL(10,2)
) AS $$
DECLARE
    user_pass RECORD;
    existing_request RECORD;
    remaining_req INTEGER;
    remaining_boost DECIMAL(10,2);
BEGIN
    -- Check if user has an active pass (cast UUID to TEXT for comparison)
    SELECT 
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id = p_user_id::text 
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active';

    -- If no active pass found
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No active pass found' as reason,
            NULL::pass_type as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END IF;

    -- Check if there's already a pending request to this speaker
    -- Cast both user_id and speaker_id to TEXT for comparison
    SELECT * INTO existing_request
    FROM public.meeting_requests mr
    WHERE mr.user_id = p_user_id::text 
      AND mr.speaker_id = p_speaker_id::text 
      AND mr.status IN ('pending', 'approved');

    IF existing_request IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You already have a pending or approved request to this speaker' as reason,
            user_pass.pass_type::pass_type as pass_type,
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
            user_pass.pass_type::pass_type as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- Check if user has enough boost for the requested amount
    IF p_boost_amount > 0 AND remaining_boost < p_boost_amount THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'Insufficient VOI boost remaining' as reason,
            user_pass.pass_type::pass_type as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- All checks passed - user can make the request
    RETURN QUERY SELECT
        TRUE as can_request,
        'Request allowed' as reason,
        user_pass.pass_type::pass_type as pass_type,
        remaining_req as remaining_requests,
        remaining_boost as remaining_boost;
END;
$$ LANGUAGE plpgsql;
