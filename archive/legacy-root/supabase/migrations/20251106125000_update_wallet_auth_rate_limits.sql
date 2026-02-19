-- Update Wallet Authentication Rate Limits
-- Increases limits and clears existing blocks

-- Update the rate limit function with new default values
CREATE OR REPLACE FUNCTION check_wallet_auth_rate_limit(
    p_wallet_address TEXT,
    p_wallet_type wallet_type,
    p_ip_address TEXT,
    p_max_attempts INTEGER DEFAULT 20, -- Increased from 5
    p_window_minutes INTEGER DEFAULT 10, -- Increased from 5
    p_block_duration_minutes INTEGER DEFAULT 5 -- Reduced from 15
)
RETURNS TABLE(
    allowed BOOLEAN,
    remaining_attempts INTEGER,
    blocked_until TIMESTAMPTZ
) AS $$
DECLARE
    v_record RECORD;
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Clean up old entries
    PERFORM cleanup_expired_rate_limits();
    
    -- Get or create rate limit record
    SELECT * INTO v_record
    FROM public.wallet_auth_rate_limits
    WHERE wallet_address = p_wallet_address
    AND wallet_type = p_wallet_type
    AND (ip_address = p_ip_address OR ip_address IS NULL OR p_ip_address IS NULL)
    FOR UPDATE;
    
    v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    IF v_record IS NULL THEN
        -- First attempt, create new record
        INSERT INTO public.wallet_auth_rate_limits (wallet_address, wallet_type, ip_address, attempt_count, window_start)
        VALUES (p_wallet_address, p_wallet_type, p_ip_address, 1, NOW())
        ON CONFLICT (wallet_address, wallet_type, ip_address) DO NOTHING;
        
        RETURN QUERY SELECT TRUE, p_max_attempts - 1, NULL::TIMESTAMPTZ;
    ELSIF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > NOW() THEN
        -- Currently blocked
        RETURN QUERY SELECT FALSE, 0, v_record.blocked_until;
    ELSIF v_record.window_start < v_window_start THEN
        -- Window expired, reset
        UPDATE public.wallet_auth_rate_limits
        SET attempt_count = 1, window_start = NOW(), blocked_until = NULL
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT TRUE, p_max_attempts - 1, NULL::TIMESTAMPTZ;
    ELSIF v_record.attempt_count >= p_max_attempts THEN
        -- Too many attempts, block
        UPDATE public.wallet_auth_rate_limits
        SET blocked_until = NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT FALSE, 0, NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL;
    ELSE
        -- Increment attempt count
        UPDATE public.wallet_auth_rate_limits
        SET attempt_count = attempt_count + 1
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT TRUE, p_max_attempts - v_record.attempt_count - 1, NULL::TIMESTAMPTZ;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Clear all existing rate limit blocks
DELETE FROM public.wallet_auth_rate_limits 
WHERE blocked_until > NOW() 
   OR (blocked_until IS NOT NULL AND blocked_until > NOW());

-- Reset attempt counts for existing records (optional - gives fresh start)
UPDATE public.wallet_auth_rate_limits 
SET attempt_count = 0, 
    window_start = NOW(), 
    blocked_until = NULL 
WHERE attempt_count > 0;

-- Comments
COMMENT ON FUNCTION check_wallet_auth_rate_limit IS 'Updated rate limit function with increased limits: 20 attempts per 10 minutes, 5 minute block duration';

