-- Upgrade all speakers with linked users to VIP status
-- This ensures all speakers have VIP passes and speaker roles

-- Function to upgrade a speaker user to VIP
CREATE OR REPLACE FUNCTION upgrade_speaker_to_vip(
    p_user_id UUID,
    p_speaker_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_pass RECORD;
    v_limits RECORD;
    v_role_exists BOOLEAN;
    v_result JSONB;
    v_updated BOOLEAN := false;
    v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- Validate user_id
    IF p_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User ID is required'
        );
    END IF;
    
    -- Step 1: Ensure speaker role exists
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
    
    -- Step 2: Get or create pass for BSL2025
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
        ELSE
            -- Already VIP, but ensure limits are correct
            IF v_pass.max_meeting_requests != COALESCE(v_limits.max_requests, 100) 
               OR v_pass.max_boost_amount != COALESCE(v_limits.max_boost, 2000.00) THEN
                BEGIN
                    UPDATE public.passes
                    SET 
                        max_meeting_requests = COALESCE(v_limits.max_requests, 100),
                        max_boost_amount = COALESCE(v_limits.max_boost, 2000.00),
                        updated_at = NOW()
                    WHERE id = v_pass.id;
                    
                    v_updated := true;
                    RAISE NOTICE 'Updated VIP pass limits for user %', p_user_id;
                EXCEPTION
                    WHEN OTHERS THEN
                        v_errors := array_append(v_errors, format('Error updating VIP pass limits: %s', SQLERRM));
                END;
            END IF;
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
                WHEN v_updated THEN 'Speaker upgraded to VIP'
                ELSE 'Speaker already has VIP status'
            END
        );
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to upgrade all speakers with linked users
CREATE OR REPLACE FUNCTION upgrade_all_speakers_to_vip()
RETURNS JSONB AS $$
DECLARE
    v_speaker RECORD;
    v_result JSONB;
    v_upgrade_result JSONB;
    v_processed_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_already_vip_count INTEGER := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting upgrade of all speakers to VIP...';
    RAISE NOTICE '========================================';
    
    -- Process all speakers with linked user_id
    FOR v_speaker IN 
        SELECT 
            id,
            name,
            user_id
        FROM public.bsl_speakers
        WHERE user_id IS NOT NULL
        ORDER BY name
    LOOP
        v_processed_count := v_processed_count + 1;
        
        BEGIN
            v_upgrade_result := upgrade_speaker_to_vip(
                p_user_id := v_speaker.user_id,
                p_speaker_name := v_speaker.name
            );
            
            IF (v_upgrade_result->>'success')::boolean = true THEN
                IF (v_upgrade_result->>'updated')::boolean = true THEN
                    v_updated_count := v_updated_count + 1;
                    RAISE NOTICE '✅ Upgraded % (user: %)', v_speaker.name, v_speaker.user_id;
                ELSE
                    v_already_vip_count := v_already_vip_count + 1;
                    RAISE NOTICE '✓ Already VIP: % (user: %)', v_speaker.name, v_speaker.user_id;
                END IF;
            ELSE
                v_error_count := v_error_count + 1;
                v_errors := array_append(v_errors, 
                    format('%s (user: %): %s', 
                        v_speaker.name, 
                        v_speaker.user_id,
                        COALESCE(v_upgrade_result->>'error', 'Unknown error')
                    )
                );
                RAISE WARNING '❌ Failed to upgrade %: %', v_speaker.name, v_upgrade_result->>'error';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                v_errors := array_append(v_errors, 
                    format('%s (user: %): %s', v_speaker.name, v_speaker.user_id, SQLERRM)
                );
                RAISE WARNING '❌ Error processing %: %', v_speaker.name, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Upgrade Results:';
    RAISE NOTICE '  Total speakers processed: %', v_processed_count;
    RAISE NOTICE '  Upgraded to VIP: %', v_updated_count;
    RAISE NOTICE '  Already VIP: %', v_already_vip_count;
    RAISE NOTICE '  Errors: %', v_error_count;
    RAISE NOTICE '========================================';
    
    RETURN json_build_object(
        'success', true,
        'processed', v_processed_count,
        'upgraded', v_updated_count,
        'already_vip', v_already_vip_count,
        'errors', v_error_count,
        'error_details', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the upgrade for all speakers
DO $$
DECLARE
    v_result JSONB;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Upgrading all speakers with linked users to VIP...';
    RAISE NOTICE 'This will:';
    RAISE NOTICE '  1. Add speaker role to all speaker users';
    RAISE NOTICE '  2. Create or upgrade passes to VIP';
    RAISE NOTICE '  3. Set correct VIP limits';
    RAISE NOTICE '========================================';
    
    v_result := upgrade_all_speakers_to_vip();
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Upgrade Summary:';
    RAISE NOTICE '  Processed: % speakers', v_result->>'processed';
    RAISE NOTICE '  Upgraded: % speakers', v_result->>'upgraded';
    RAISE NOTICE '  Already VIP: % speakers', v_result->>'already_vip';
    RAISE NOTICE '  Errors: % speakers', v_result->>'errors';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Full result: %', v_result;
END $$;

COMMENT ON FUNCTION upgrade_speaker_to_vip IS 'Upgrades a speaker user to VIP status by ensuring they have speaker role and VIP pass with correct limits.';
COMMENT ON FUNCTION upgrade_all_speakers_to_vip IS 'Upgrades all speakers with linked user_id to VIP status. Processes all speakers in bsl_speakers table that have a user_id.';














