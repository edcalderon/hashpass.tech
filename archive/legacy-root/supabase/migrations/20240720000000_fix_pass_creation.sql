-- Fix pass creation for new users

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
        COALESCE(limits.max_requests, 5),  -- Default to 5 if null
        COALESCE(limits.max_boost, 0),     -- Default to 0 if null
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
    RAISE WARNING 'Error creating default pass for user %: %', p_user_id, SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a default pass for new users
  PERFORM public.create_default_pass(NEW.id, 'general');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
  RETURN NEW; -- Always return NEW to prevent signup failure
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    EXECUTE 'CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()';
  END IF;
END $$;
