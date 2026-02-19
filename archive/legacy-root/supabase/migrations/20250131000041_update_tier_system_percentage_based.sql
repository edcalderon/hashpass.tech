-- Update tier system to calculate limits based on total speaker count
-- General: 25% of total speakers
-- Business: 63% of total speakers
-- VIP: 101% of total speakers

-- Update get_pass_type_limits function to calculate dynamically based on speaker count
CREATE OR REPLACE FUNCTION get_pass_type_limits(p_pass_type pass_type)
RETURNS TABLE (
    max_requests INTEGER,
    max_boost DECIMAL(10,2),
    daily_limit INTEGER,
    weekly_limit INTEGER,
    monthly_limit INTEGER
) AS $$
DECLARE
    total_speakers INTEGER;
    general_limit INTEGER;
    business_limit INTEGER;
    vip_limit INTEGER;
BEGIN
    -- Count total speakers
    SELECT COUNT(*) INTO total_speakers
    FROM public.bsl_speakers;
    
    -- Calculate limits based on percentages
    general_limit := CEIL(total_speakers * 0.25);  -- 25%
    business_limit := CEIL(total_speakers * 0.63);  -- 63%
    vip_limit := CEIL(total_speakers * 1.01);  -- 101%
    
    -- Return limits based on pass type
    RETURN QUERY SELECT 
        CASE 
            WHEN p_pass_type = 'vip' THEN vip_limit
            WHEN p_pass_type = 'business' THEN business_limit
            ELSE general_limit
        END as max_requests,
        CASE 
            -- Maintain 1:20 ratio (requests to boost dollars)
            WHEN p_pass_type = 'vip' THEN vip_limit * 20.00
            WHEN p_pass_type = 'business' THEN business_limit * 20.00
            ELSE general_limit * 20.00
        END as max_boost,
        CASE 
            -- Daily limits: approximately 20% of max requests
            WHEN p_pass_type = 'vip' THEN GREATEST(1, CEIL(vip_limit * 0.20))
            WHEN p_pass_type = 'business' THEN GREATEST(1, CEIL(business_limit * 0.20))
            ELSE GREATEST(1, CEIL(general_limit * 0.20))
        END as daily_limit,
        CASE 
            -- Weekly limits: approximately 50% of max requests
            WHEN p_pass_type = 'vip' THEN GREATEST(1, CEIL(vip_limit * 0.50))
            WHEN p_pass_type = 'business' THEN GREATEST(1, CEIL(business_limit * 0.50))
            ELSE GREATEST(1, CEIL(general_limit * 0.50))
        END as weekly_limit,
        CASE 
            -- Monthly limits: same as max requests
            WHEN p_pass_type = 'vip' THEN vip_limit
            WHEN p_pass_type = 'business' THEN business_limit
            ELSE general_limit
        END as monthly_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all existing passes with new calculated limits
DO $$
DECLARE
    total_speakers INTEGER;
    general_limit INTEGER;
    business_limit INTEGER;
    vip_limit INTEGER;
BEGIN
    -- Count total speakers
    SELECT COUNT(*) INTO total_speakers
    FROM public.bsl_speakers;
    
    -- Calculate limits
    general_limit := CEIL(total_speakers * 0.25);
    business_limit := CEIL(total_speakers * 0.63);
    vip_limit := CEIL(total_speakers * 1.01);
    
    -- Update passes
    UPDATE public.passes 
    SET 
        max_meeting_requests = CASE 
            WHEN pass_type = 'vip' THEN vip_limit
            WHEN pass_type = 'business' THEN business_limit
            ELSE general_limit
        END,
        max_boost_amount = CASE 
            WHEN pass_type = 'vip' THEN vip_limit * 20.00
            WHEN pass_type = 'business' THEN business_limit * 20.00
            ELSE general_limit * 20.00
        END,
        updated_at = NOW()
    WHERE event_id = 'bsl2025';
END $$;

-- Add comment
COMMENT ON FUNCTION get_pass_type_limits IS 'Returns the request limits for a given pass type calculated dynamically based on total speaker count. General=25% of speakers, Business=63% of speakers, VIP=101% of speakers';


