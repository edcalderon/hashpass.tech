-- Fix pass creation for users who deleted their account and re-registered
-- Ensure that cancelled/deprecated passes don't interfere with new pass creation
-- Only check for active passes, not cancelled ones

-- Update create_default_pass to only check for active passes
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
    
    -- Check if user already has an ACTIVE pass for this event
    -- Only check for active passes, ignore cancelled/expired ones
    SELECT id INTO existing_pass_id 
    FROM passes 
    WHERE user_id = p_user_id::text 
    AND event_id = 'bsl2025'
    AND status = 'active'  -- Only check for active passes
    LIMIT 1;
    
    -- If an active pass already exists, return the existing pass ID
    IF existing_pass_id IS NOT NULL THEN
        RETURN existing_pass_id;
    END IF;
    
    -- Mark any existing cancelled/expired passes as deprecated to avoid confusion
    -- This ensures old passes don't interfere
    UPDATE passes
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE user_id = p_user_id::text 
    AND event_id = 'bsl2025'
    AND status IN ('expired', 'used', 'suspended');  -- Mark non-active passes as cancelled
    
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(pass_type_text::pass_type);
    
    -- Create new active pass
    INSERT INTO passes (
        id,
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
        gen_random_uuid()::text,
        p_user_id::text,
        'bsl2025',
        pass_type_text,
        'active',
        'BSL2025-' || pass_type_text || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
        COALESCE(limits.max_requests, 10),  -- Default to 10 for general
        COALESCE(limits.max_boost, 200),     -- Default to 200 for general
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
    
    RETURN pass_id;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating default pass for user %: %', p_user_id, SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure delete_user_account properly deprecates all passes
-- Update the function to mark all passes as cancelled (not just update status)
CREATE OR REPLACE FUNCTION delete_user_account(
    p_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Mark ALL passes as cancelled (deleted user)
    -- This ensures they don't interfere if user re-registers
    UPDATE passes
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE user_id = p_user_id::text;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete pass request limits
    DELETE FROM pass_request_limits
    WHERE user_id = p_user_id;
    
    -- Delete user tutorial progress
    DELETE FROM user_tutorial_progress
    WHERE user_id = p_user_id;
    
    -- Delete user blocks (both as blocker and blocked)
    DELETE FROM user_blocks
    WHERE blocker_user_id = p_user_id OR blocked_user_id::TEXT = p_user_id::TEXT;
    
    -- Delete meeting requests (as requester)
    DELETE FROM meeting_requests
    WHERE requester_id = p_user_id;
    
    -- Delete user agenda status
    DELETE FROM user_agenda_status
    WHERE user_id = p_user_id;
    
    -- Delete email tracking
    DELETE FROM user_email_tracking
    WHERE user_id = p_user_id;
    
    -- Note: The actual auth.users deletion should be handled by Supabase Auth Admin API
    -- This function handles related data cleanup
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error deleting user account: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

