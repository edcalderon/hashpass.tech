-- File: 20240720000001_create_default_pass.sql
-- Consolidated create_default_pass function with all necessary features

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.create_default_pass;

-- Create or replace the function with improved error handling
CREATE OR REPLACE FUNCTION public.create_default_pass(
    p_user_id UUID,
    p_pass_type TEXT DEFAULT 'general'
) RETURNS TEXT AS $$
DECLARE
    pass_id TEXT;
    limits RECORD;
    existing_pass_id TEXT;
    pass_type_text TEXT;
BEGIN
    -- Use the pass type directly as text (no enum casting needed)
    pass_type_text := LOWER(TRIM(p_pass_type));

    -- Validate pass type
    IF pass_type_text NOT IN ('general', 'vip', 'business') THEN
        pass_type_text := 'general';
    END IF;

    -- Check if user already has a pass for this event
    SELECT id INTO existing_pass_id
    FROM passes
    WHERE user_id = p_user_id::text
    AND event_id = 'bsl2025'
    LIMIT 1;

    -- If pass already exists, return the existing pass ID
    IF existing_pass_id IS NOT NULL THEN
        RETURN existing_pass_id;
    END IF;

    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(pass_type_text::pass_type);

    -- Create pass
    INSERT INTO passes (
        user_id,
        event_id,
        pass_type,
        status,
        pass_number,
        max_meeting_requests,
        max_boost_amount,
        access_features,
        special_perks,
        created_at,
        updated_at
    ) VALUES (
        p_user_id::text,
        'bsl2025',
        pass_type_text,
        'active',
        'BSL2025-' || pass_type_text || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
        COALESCE(limits.max_requests, 5),
        COALESCE(limits.max_boost, 0),
        CASE pass_type_text
            WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
            WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
            ELSE ARRAY['general_sessions']
        END,
        CASE pass_type_text
            WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
            WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
            ELSE ARRAY['basic_swag']
        END,
        NOW(),
        NOW()
    ) RETURNING id INTO pass_id;

    -- Initialize pass request limits
    INSERT INTO pass_request_limits (
        pass_id,
        user_id,
        remaining_meeting_requests,
        remaining_boost_amount,
        last_reset_at
    ) VALUES (
        pass_id,
        p_user_id,
        COALESCE(limits.max_requests, 5),
        COALESCE(limits.max_boost, 0),
        NOW()
    );

    RETURN pass_id;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating default pass: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for the function
COMMENT ON FUNCTION public.create_default_pass IS 'Creates a default pass for a user with the specified type, initializing all necessary related records.';
