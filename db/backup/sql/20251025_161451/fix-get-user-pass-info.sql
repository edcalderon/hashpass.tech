-- Fix get_user_pass_info function to properly cast types
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
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount,
        p.access_features, p.special_perks
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id = p_user_id::text AND p.event_id = 'bsl2025' AND p.status = 'active';

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
