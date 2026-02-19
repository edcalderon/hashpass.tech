-- Update existing passes with new percentage-based limits
-- This ensures all existing passes are updated with the correct limits based on current speaker count

DO $$
DECLARE
    total_speakers INTEGER;
    general_limit INTEGER;
    business_limit INTEGER;
    vip_limit INTEGER;
    updated_count INTEGER;
BEGIN
    -- Count total speakers
    SELECT COUNT(*) INTO total_speakers
    FROM public.bsl_speakers;
    
    RAISE NOTICE 'Total speakers found: %', total_speakers;
    
    -- Calculate limits based on percentages
    general_limit := CEIL(total_speakers * 0.25);  -- 25%
    business_limit := CEIL(total_speakers * 0.63);  -- 63%
    vip_limit := CEIL(total_speakers * 1.01);  -- 101%
    
    RAISE NOTICE 'Calculated limits - General: %, Business: %, VIP: %', general_limit, business_limit, vip_limit;
    
    -- Update all passes for bsl2025 event
    UPDATE public.passes 
    SET 
        max_meeting_requests = CASE 
            WHEN pass_type = 'vip' THEN vip_limit
            WHEN pass_type = 'business' THEN business_limit
            WHEN pass_type = 'general' THEN general_limit
            ELSE general_limit  -- Default to general for any unknown types
        END,
        max_boost_amount = CASE 
            WHEN pass_type = 'vip' THEN vip_limit * 20.00
            WHEN pass_type = 'business' THEN business_limit * 20.00
            WHEN pass_type = 'general' THEN general_limit * 20.00
            ELSE general_limit * 20.00  -- Default to general for any unknown types
        END,
        updated_at = NOW()
    WHERE event_id = 'bsl2025';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    RAISE NOTICE 'Updated % passes with new limits', updated_count;
    
    -- Show summary of updated passes by type
    RAISE NOTICE 'Summary of updated passes:';
    RAISE NOTICE '  General passes: % (limit: % requests, $% boost)', 
        (SELECT COUNT(*) FROM public.passes WHERE event_id = 'bsl2025' AND pass_type = 'general'),
        general_limit,
        general_limit * 20;
    RAISE NOTICE '  Business passes: % (limit: % requests, $% boost)', 
        (SELECT COUNT(*) FROM public.passes WHERE event_id = 'bsl2025' AND pass_type = 'business'),
        business_limit,
        business_limit * 20;
    RAISE NOTICE '  VIP passes: % (limit: % requests, $% boost)', 
        (SELECT COUNT(*) FROM public.passes WHERE event_id = 'bsl2025' AND pass_type = 'vip'),
        vip_limit,
        vip_limit * 20;
END $$;


