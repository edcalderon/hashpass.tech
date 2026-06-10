-- Fix all type casting issues in both functions

-- Drop all existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.can_make_meeting_request(TEXT, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS public.get_user_pass_info(UUID);
DROP FUNCTION IF EXISTS public.get_user_pass_info(TEXT);

-- Fix get_user_pass_info function with proper type casting
CREATE OR REPLACE FUNCTION public.get_user_pass_info(
    p_user_id TEXT
) RETURNS TABLE(
    pass_id TEXT,
    pass_type pass_type,
    status pass_status,
    pass_number TEXT,
    max_requests INTEGER,
    used_requests INTEGER,
    remaining_requests INTEGER,
    max_boost DECIMAL(10,2),
    used_boost DECIMAL(10,2),
    remaining_boost DECIMAL(10,2),
    access_features TEXT[],
    special_perks TEXT[]
) AS $$
DECLARE
    user_pass RECORD;
BEGIN
    -- Check if user has an active pass with flexible type casting
    BEGIN
        -- Try UUID comparison first
        SELECT 
            p.id, p.pass_type::text, p.status::text, p.pass_number,
            p.max_meeting_requests, p.used_meeting_requests,
            p.max_boost_amount, p.used_boost_amount,
            p.access_features, p.special_perks
        INTO user_pass
        FROM public.passes p
        WHERE p.user_id = p_user_id::uuid
          AND p.event_id = 'bsl2025' 
          AND p.status = 'active';
    EXCEPTION
        WHEN invalid_text_representation THEN
            -- If UUID casting fails, try TEXT comparison
            SELECT 
                p.id, p.pass_type::text, p.status::text, p.pass_number,
                p.max_meeting_requests, p.used_meeting_requests,
                p.max_boost_amount, p.used_boost_amount,
                p.access_features, p.special_perks
            INTO user_pass
            FROM public.passes p
            WHERE p.user_id::text = p_user_id::text
              AND p.event_id = 'bsl2025' 
              AND p.status = 'active';
    END;

    IF user_pass IS NOT NULL THEN
        RETURN QUERY SELECT
            user_pass.id,
            user_pass.pass_type::pass_type,
            user_pass.status::pass_status,
            user_pass.pass_number,
            user_pass.max_meeting_requests,
            user_pass.used_meeting_requests,
            user_pass.max_meeting_requests - user_pass.used_meeting_requests AS remaining_requests,
            user_pass.max_boost_amount,
            user_pass.used_boost_amount,
            user_pass.max_boost_amount - user_pass.used_boost_amount AS remaining_boost,
            user_pass.access_features,
            user_pass.special_perks;
    ELSE
        -- If no pass found, return default/null values
        RETURN QUERY SELECT
            NULL::TEXT, NULL::pass_type, NULL::pass_status, NULL::TEXT,
            0, 0, 0, 0.00, 0.00, 0.00, '{}'::TEXT[], '{}'::TEXT[];
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Fix can_make_meeting_request function with proper type casting
CREATE OR REPLACE FUNCTION public.can_make_meeting_request(
    p_user_id TEXT,
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
    -- Check if user has an active pass with flexible type casting
    BEGIN
        -- Try UUID comparison first
        SELECT 
            p.id, p.pass_type::text, p.status::text, p.pass_number,
            p.max_meeting_requests, p.used_meeting_requests,
            p.max_boost_amount, p.used_boost_amount
        INTO user_pass
        FROM public.passes p
        WHERE p.user_id = p_user_id::uuid
          AND p.event_id = 'bsl2025' 
          AND p.status = 'active';
    EXCEPTION
        WHEN invalid_text_representation THEN
            -- If UUID casting fails, try TEXT comparison
            SELECT 
                p.id, p.pass_type::text, p.status::text, p.pass_number,
                p.max_meeting_requests, p.used_meeting_requests,
                p.max_boost_amount, p.used_boost_amount
            INTO user_pass
            FROM public.passes p
            WHERE p.user_id::text = p_user_id::text
              AND p.event_id = 'bsl2025' 
              AND p.status = 'active';
    END;

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
    SELECT * INTO existing_request
    FROM public.meeting_requests mr
    WHERE mr.requester_id = p_user_id::text 
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
