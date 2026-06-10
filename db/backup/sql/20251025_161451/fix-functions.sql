-- Fix get_user_pass_info function to handle type casting properly
CREATE OR REPLACE FUNCTION get_user_pass_info(p_user_id UUID)
RETURNS TABLE(
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
    SELECT
        p.id, p.pass_type, p.status, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount,
        p.access_features, p.special_perks
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id = p_user_id::text AND p.event_id = 'bsl2025' AND p.status = 'active';

    IF user_pass IS NOT NULL THEN
        RETURN QUERY SELECT
            user_pass.id,
            user_pass.pass_type,
            user_pass.status,
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

-- Fix create_default_pass function to generate ID properly
CREATE OR REPLACE FUNCTION create_default_pass(
    p_user_id UUID,
    p_pass_type pass_type DEFAULT 'general'
) RETURNS TEXT AS $$
DECLARE
    new_pass_id TEXT;
    limits RECORD;
    pass_num TEXT;
BEGIN
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(p_pass_type);
    
    -- Generate a unique pass ID
    new_pass_id := 'BSL2025-' || p_user_id::text || '-' || EXTRACT(EPOCH FROM NOW())::bigint;
    
    -- Generate a simple pass number
    pass_num := 'BSL2025-' || p_pass_type::text || '-' || EXTRACT(EPOCH FROM NOW())::bigint;
    
    -- Create pass
    INSERT INTO public.passes (
        id,
        user_id,
        event_id,
        pass_type,
        status,
        pass_number,
        max_meeting_requests,
        used_meeting_requests,
        max_boost_amount,
        used_boost_amount,
        access_features,
        special_perks
    ) VALUES (
        new_pass_id,
        p_user_id::text,
        'bsl2025',
        p_pass_type,
        'active',
        pass_num,
        limits.max_requests,
        0,
        limits.max_boost,
        0,
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
    ) RETURNING id INTO new_pass_id;

    -- Initialize pass_request_limits for the new pass
    INSERT INTO public.pass_request_limits (pass_id, user_id)
    VALUES (new_pass_id, p_user_id);

    RETURN new_pass_id;
END;
$$ LANGUAGE plpgsql;
