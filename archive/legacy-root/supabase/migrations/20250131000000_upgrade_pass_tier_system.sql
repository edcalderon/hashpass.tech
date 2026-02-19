-- Upgrade pass tier system with new limits
-- General: 10 requests (was 5), Business: 60 requests (was 20), VIP: 100 requests (was 50)
-- Boost amounts updated proportionally (maintaining 1:20 ratio: requests to boost dollars)

-- Update get_pass_type_limits function with new values
CREATE OR REPLACE FUNCTION get_pass_type_limits(p_pass_type pass_type)
RETURNS TABLE (
    max_requests INTEGER,
    max_boost DECIMAL(10,2),
    daily_limit INTEGER,
    weekly_limit INTEGER,
    monthly_limit INTEGER
) AS $$
BEGIN
    RETURN QUERY SELECT 
        CASE 
            WHEN p_pass_type = 'vip' THEN 100      -- Was 50, now 100 (x2)
            WHEN p_pass_type = 'business' THEN 60   -- Was 20, now 60 (x3)
            ELSE 10                                 -- Was 5, now 10 (x2)
        END as max_requests,
        CASE 
            WHEN p_pass_type = 'vip' THEN 2000.00      -- Was 1000, now 2000 (x2, ratio 1:20)
            WHEN p_pass_type = 'business' THEN 1200.00 -- Was 500, now 1200 (x2.4, ratio 1:20)
            ELSE 200.00                                -- Was 100, now 200 (x2, ratio 1:20)
        END as max_boost,
        CASE 
            WHEN p_pass_type = 'vip' THEN 20
            WHEN p_pass_type = 'business' THEN 15
            ELSE 5
        END as daily_limit,
        CASE 
            WHEN p_pass_type = 'vip' THEN 50
            WHEN p_pass_type = 'business' THEN 30
            ELSE 10
        END as weekly_limit,
        CASE 
            WHEN p_pass_type = 'vip' THEN 100
            WHEN p_pass_type = 'business' THEN 60
            ELSE 10
        END as monthly_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update all existing passes with new limits based on their pass_type
UPDATE public.passes 
SET 
    max_meeting_requests = CASE 
        WHEN pass_type = 'vip' THEN 100
        WHEN pass_type = 'business' THEN 60
        ELSE 10
    END,
    max_boost_amount = CASE 
        WHEN pass_type = 'vip' THEN 2000.00
        WHEN pass_type = 'business' THEN 1200.00
        ELSE 200.00
    END,
    updated_at = NOW()
WHERE event_id = 'bsl2025';

-- Note: pass_request_limits table uses a different structure (daily/weekly/monthly tracking)
-- The remaining requests/boost are calculated dynamically from passes table

-- Also update the CASE version of the function if it exists
CREATE OR REPLACE FUNCTION get_pass_type_limits(p_pass_type pass_type)
RETURNS TABLE(
    max_requests INTEGER,
    max_boost DECIMAL,
    daily_limit INTEGER,
    weekly_limit INTEGER,
    monthly_limit INTEGER
) AS $$
BEGIN
    CASE p_pass_type
        WHEN 'vip' THEN
            RETURN QUERY SELECT 100, 2000.00, 20, 50, 100;
        WHEN 'business' THEN
            RETURN QUERY SELECT 60, 1200.00, 15, 30, 60;
        WHEN 'general' THEN
            RETURN QUERY SELECT 10, 200.00, 5, 10, 10;
        ELSE
            RETURN QUERY SELECT 0, 0.00, 0, 0, 0;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_pass_type_limits IS 'Returns the request limits for a given pass type. Updated limits: General=10 requests/$200 boost, Business=60 requests/$1200 boost, VIP=100 requests/$2000 boost';

