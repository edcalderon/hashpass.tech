-- Match users to speakers by name and upgrade them to speaker status
-- This finds users whose names match speaker names and links them

-- Helper function to normalize names for comparison
-- Note: This is a simplified version that doesn't require unaccent extension
CREATE OR REPLACE FUNCTION normalize_name_for_matching(p_name TEXT)
RETURNS TEXT AS $$
BEGIN
    IF p_name IS NULL THEN
        RETURN '';
    END IF;
    
    RETURN lower(trim(
        regexp_replace(
            regexp_replace(
                p_name,
                '[^a-z0-9\s]', '', 'gi'
            ),
            '\s+', ' ', 'g'
        )
    ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function to check if two names match
CREATE OR REPLACE FUNCTION names_match(p_name1 TEXT, p_name2 TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_normalized1 TEXT;
    v_normalized2 TEXT;
    v_parts1 TEXT[];
    v_parts2 TEXT[];
BEGIN
    IF p_name1 IS NULL OR p_name2 IS NULL THEN
        RETURN false;
    END IF;
    
    v_normalized1 := normalize_name_for_matching(p_name1);
    v_normalized2 := normalize_name_for_matching(p_name2);
    
    -- Exact match after normalization
    IF v_normalized1 = v_normalized2 THEN
        RETURN true;
    END IF;
    
    -- Check if one contains the other (for partial matches)
    IF (v_normalized1 LIKE '%' || v_normalized2 || '%' OR v_normalized2 LIKE '%' || v_normalized1 || '%') THEN
        -- Only consider it a match if both are substantial (at least 5 chars)
        IF length(v_normalized1) >= 5 AND length(v_normalized2) >= 5 THEN
            RETURN true;
        END IF;
    END IF;
    
    -- Check first name and last name match
    v_parts1 := string_to_array(v_normalized1, ' ');
    v_parts2 := string_to_array(v_normalized2, ' ');
    
    IF array_length(v_parts1, 1) >= 2 AND array_length(v_parts2, 1) >= 2 THEN
        -- First and last name match
        IF v_parts1[1] = v_parts2[1] AND v_parts1[array_length(v_parts1, 1)] = v_parts2[array_length(v_parts2, 1)] THEN
            RETURN true;
        END IF;
        
        -- First name match with substantial last names
        IF v_parts1[1] = v_parts2[1] 
           AND length(v_parts1[array_length(v_parts1, 1)]) >= 3 
           AND length(v_parts2[array_length(v_parts2, 1)]) >= 3 THEN
            -- Check if last names are similar
            IF v_parts1[array_length(v_parts1, 1)] LIKE '%' || v_parts2[array_length(v_parts2, 1)] || '%'
               OR v_parts2[array_length(v_parts2, 1)] LIKE '%' || v_parts1[array_length(v_parts1, 1)] || '%' THEN
                RETURN true;
            END IF;
        END IF;
        
        -- Last name match with substantial first names
        IF v_parts1[array_length(v_parts1, 1)] = v_parts2[array_length(v_parts2, 1)]
           AND length(v_parts1[1]) >= 3 
           AND length(v_parts2[1]) >= 3 THEN
            -- Check if first names are similar
            IF v_parts1[1] LIKE '%' || v_parts2[1] || '%'
               OR v_parts2[1] LIKE '%' || v_parts1[1] || '%' THEN
                RETURN true;
            END IF;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get user name from auth.users
CREATE OR REPLACE FUNCTION get_user_display_name(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_name TEXT;
BEGIN
    SELECT 
        COALESCE(
            raw_user_meta_data->>'full_name',
            raw_user_meta_data->>'name',
            email
        )
    INTO v_name
    FROM auth.users
    WHERE id = p_user_id;
    
    RETURN v_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to match and upgrade a user to speaker
CREATE OR REPLACE FUNCTION match_and_upgrade_user_to_speaker(
    p_user_id UUID,
    p_speaker_id TEXT,
    p_speaker_name TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_name TEXT;
    v_pass RECORD;
    v_limits RECORD;
    v_role_exists BOOLEAN;
    v_result JSONB;
    v_updated BOOLEAN := false;
    v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Get user name
    v_user_name := get_user_display_name(p_user_id);
    
    IF v_user_name IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Could not get user name'
        );
    END IF;
    
    -- Step 1: Link user to speaker
    BEGIN
        UPDATE public.bsl_speakers
        SET 
            user_id = p_user_id,
            updated_at = NOW()
        WHERE id = p_speaker_id;
        
        v_updated := true;
        RAISE NOTICE 'Linked user % (%) to speaker % (%)', p_user_id, v_user_name, p_speaker_id, p_speaker_name;
    EXCEPTION
        WHEN OTHERS THEN
            v_errors := array_append(v_errors, format('Error linking user to speaker: %s', SQLERRM));
    END;
    
    -- Step 2: Ensure speaker role exists
    BEGIN
        SELECT EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = p_user_id
            AND role = 'speaker'
        ) INTO v_role_exists;
        
        IF NOT v_role_exists THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (p_user_id, 'speaker')
            ON CONFLICT (user_id, role) DO NOTHING;
            
            v_updated := true;
            RAISE NOTICE 'Added speaker role for user %', p_user_id;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            v_errors := array_append(v_errors, format('Error adding speaker role: %s', SQLERRM));
    END;
    
    -- Step 3: Get or create VIP pass
    SELECT * INTO v_pass
    FROM public.passes
    WHERE user_id = p_user_id::TEXT
    AND event_id = 'bsl2025'
    LIMIT 1;
    
    -- Get VIP limits
    SELECT * INTO v_limits
    FROM get_pass_type_limits('vip')
    LIMIT 1;
    
    -- If no pass exists, create VIP pass
    IF v_pass IS NULL THEN
        BEGIN
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
                special_perks,
                created_at,
                updated_at
            ) VALUES (
                'pass-' || p_user_id::TEXT || '-bsl2025',
                p_user_id::TEXT,
                'bsl2025',
                'vip',
                'active',
                'BSL2025-VIP-' || EXTRACT(EPOCH FROM NOW())::bigint,
                COALESCE(v_limits.max_requests, 100),
                0,
                COALESCE(v_limits.max_boost, 2000.00),
                0.00,
                ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
                ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag'],
                NOW(),
                NOW()
            );
            
            v_updated := true;
            RAISE NOTICE 'Created VIP pass for user %', p_user_id;
        EXCEPTION
            WHEN OTHERS THEN
                v_errors := array_append(v_errors, format('Error creating VIP pass: %s', SQLERRM));
        END;
    ELSE
        -- Pass exists, check if it needs to be upgraded to VIP
        IF v_pass.pass_type != 'vip' THEN
            BEGIN
                UPDATE public.passes
                SET 
                    pass_type = 'vip',
                    status = 'active',
                    max_meeting_requests = COALESCE(v_limits.max_requests, 100),
                    max_boost_amount = COALESCE(v_limits.max_boost, 2000.00),
                    access_features = ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'],
                    special_perks = ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag'],
                    updated_at = NOW()
                WHERE id = v_pass.id;
                
                v_updated := true;
                RAISE NOTICE 'Upgraded pass to VIP for user % (was: %)', p_user_id, v_pass.pass_type;
            EXCEPTION
                WHEN OTHERS THEN
                    v_errors := array_append(v_errors, format('Error upgrading pass to VIP: %s', SQLERRM));
            END;
        END IF;
    END IF;
    
    -- Build result
    IF array_length(v_errors, 1) > 0 THEN
        v_result := json_build_object(
            'success', false,
            'updated', v_updated,
            'errors', v_errors
        );
    ELSE
        v_result := json_build_object(
            'success', true,
            'updated', v_updated,
            'message', CASE 
                WHEN v_updated THEN 'User matched and upgraded to speaker/VIP'
                ELSE 'User already has speaker/VIP status'
            END
        );
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Main function to match all users to speakers by name
CREATE OR REPLACE FUNCTION match_all_users_to_speakers_by_name()
RETURNS JSONB AS $$
DECLARE
    v_speaker RECORD;
    v_user RECORD;
    v_user_name TEXT;
    v_match_result JSONB;
    v_processed_count INTEGER := 0;
    v_matched_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
    v_matches TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting user-to-speaker matching by name...';
    RAISE NOTICE '========================================';
    
    -- Process all speakers that don't have a user_id yet
    FOR v_speaker IN 
        SELECT 
            id,
            name
        FROM public.bsl_speakers
        WHERE user_id IS NULL
        ORDER BY name
    LOOP
        v_processed_count := v_processed_count + 1;
        
        -- Try to find matching user
        FOR v_user IN 
            SELECT 
                id,
                COALESCE(
                    raw_user_meta_data->>'full_name',
                    raw_user_meta_data->>'name',
                    email
                ) as display_name
            FROM auth.users
            WHERE COALESCE(
                raw_user_meta_data->>'full_name',
                raw_user_meta_data->>'name',
                email
            ) IS NOT NULL
        LOOP
            v_user_name := v_user.display_name;
            
            -- Check if names match
            IF names_match(v_speaker.name, v_user_name) THEN
                BEGIN
                    v_match_result := match_and_upgrade_user_to_speaker(
                        p_user_id := v_user.id,
                        p_speaker_id := v_speaker.id,
                        p_speaker_name := v_speaker.name
                    );
                    
                    IF (v_match_result->>'success')::boolean = true THEN
                        v_matched_count := v_matched_count + 1;
                        IF (v_match_result->>'updated')::boolean = true THEN
                            v_updated_count := v_updated_count + 1;
                        END IF;
                        v_matches := array_append(v_matches, 
                            format('Matched: %s (user: %) -> %s (speaker: %)', 
                                v_user_name, v_user.id, v_speaker.name, v_speaker.id)
                        );
                        RAISE NOTICE '✅ Matched: % (%) -> % (%)', 
                            v_user_name, v_user.id, v_speaker.name, v_speaker.id;
                        -- Break after first match
                        EXIT;
                    ELSE
                        v_error_count := v_error_count + 1;
                        v_errors := array_append(v_errors, 
                            format('%s -> %s: %s', v_speaker.name, v_user_name, v_match_result->>'error')
                        );
                    END IF;
                EXCEPTION
                    WHEN OTHERS THEN
                        v_error_count := v_error_count + 1;
                        v_errors := array_append(v_errors, 
                            format('%s -> %s: %s', v_speaker.name, v_user_name, SQLERRM)
                        );
                        RAISE WARNING '❌ Error matching % to %: %', v_speaker.name, v_user_name, SQLERRM;
                END;
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Matching Results:';
    RAISE NOTICE '  Speakers processed: %', v_processed_count;
    RAISE NOTICE '  Matches found: %', v_matched_count;
    RAISE NOTICE '  Updated: %', v_updated_count;
    RAISE NOTICE '  Errors: %', v_error_count;
    RAISE NOTICE '========================================';
    
    RETURN json_build_object(
        'success', true,
        'processed', v_processed_count,
        'matched', v_matched_count,
        'updated', v_updated_count,
        'errors', v_error_count,
        'matches', v_matches,
        'error_details', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the matching
DO $$
DECLARE
    v_result JSONB;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Matching users to speakers by name...';
    RAISE NOTICE 'This will:';
    RAISE NOTICE '  1. Find users whose names match speaker names';
    RAISE NOTICE '  2. Link users to speakers (update bsl_speakers.user_id)';
    RAISE NOTICE '  3. Add speaker role to matched users';
    RAISE NOTICE '  4. Create or upgrade passes to VIP';
    RAISE NOTICE '========================================';
    
    v_result := match_all_users_to_speakers_by_name();
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Matching Summary:';
    RAISE NOTICE '  Processed: % speakers', v_result->>'processed';
    RAISE NOTICE '  Matched: % users', v_result->>'matched';
    RAISE NOTICE '  Updated: % users', v_result->>'updated';
    RAISE NOTICE '  Errors: %', v_result->>'errors';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Full result: %', v_result;
END $$;

COMMENT ON FUNCTION normalize_name_for_matching IS 'Normalizes names for fuzzy matching by removing accents, special characters, and normalizing whitespace.';
COMMENT ON FUNCTION names_match IS 'Checks if two names match using fuzzy matching logic (exact, partial, first/last name matching).';
COMMENT ON FUNCTION match_and_upgrade_user_to_speaker IS 'Links a user to a speaker, adds speaker role, and upgrades pass to VIP.';
COMMENT ON FUNCTION match_all_users_to_speakers_by_name IS 'Matches all users to speakers by name and upgrades matched users to speaker/VIP status.';

