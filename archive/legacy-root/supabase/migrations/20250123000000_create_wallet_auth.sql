-- Wallet Authentication System
-- Supports Ethereum (EIP-4361) and Solana (SIWS) wallet sign-in

-- Create wallet type enum
DO $$ BEGIN
    CREATE TYPE wallet_type AS ENUM ('ethereum', 'solana');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create wallet_auth table to store wallet addresses linked to users
CREATE TABLE IF NOT EXISTS public.wallet_auth (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Nullable: null during challenge, set after auth
    wallet_type wallet_type NOT NULL,
    wallet_address TEXT NOT NULL, -- Ethereum address or Solana public key
    nonce TEXT, -- For challenge-response authentication
    nonce_expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wallet_type, wallet_address) -- One address per wallet type
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallet_auth_user_id ON public.wallet_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_auth_address ON public.wallet_auth(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_auth_type_address ON public.wallet_auth(wallet_type, wallet_address);

-- Enable RLS
ALTER TABLE public.wallet_auth ENABLE ROW LEVEL SECURITY;

-- Users can view their own wallet connections (or null user_id for challenges)
CREATE POLICY "Users can view their own wallets" ON public.wallet_auth
    FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

-- Users can insert wallet connections (including challenges with null user_id)
CREATE POLICY "Users can insert their own wallets" ON public.wallet_auth
    FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Users can update their own wallet connections
CREATE POLICY "Users can update their own wallets" ON public.wallet_auth
    FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

-- Service role can manage all wallets (for authentication flows)
CREATE POLICY "Service role can manage all wallets" ON public.wallet_auth
    FOR ALL USING (auth.role() = 'service_role');

-- Create rate limiting table for wallet authentication attempts
CREATE TABLE IF NOT EXISTS public.wallet_auth_rate_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    wallet_type wallet_type NOT NULL,
    ip_address TEXT,
    attempt_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ DEFAULT NOW(),
    blocked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(wallet_address, wallet_type, ip_address)
);

-- Create index for rate limiting lookups
CREATE INDEX IF NOT EXISTS idx_wallet_rate_limit_lookup ON public.wallet_auth_rate_limits(wallet_address, wallet_type, ip_address, window_start);

-- Enable RLS for rate limits (service role only)
ALTER TABLE public.wallet_auth_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage rate limits" ON public.wallet_auth_rate_limits
    FOR ALL USING (auth.role() = 'service_role');

-- Create function to clean up expired rate limit entries
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM public.wallet_auth_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour'
    AND blocked_until IS NULL
    OR (blocked_until IS NOT NULL AND blocked_until < NOW());
END;
$$ LANGUAGE plpgsql;

-- Create function to check and update rate limits
CREATE OR REPLACE FUNCTION check_wallet_auth_rate_limit(
    p_wallet_address TEXT,
    p_wallet_type wallet_type,
    p_ip_address TEXT,
    p_max_attempts INTEGER DEFAULT 5,
    p_window_minutes INTEGER DEFAULT 5,
    p_block_duration_minutes INTEGER DEFAULT 15
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

-- Create updated_at trigger
CREATE TRIGGER update_wallet_auth_updated_at BEFORE UPDATE ON public.wallet_auth
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.wallet_auth IS 'Wallet addresses linked to user accounts for authentication';
COMMENT ON COLUMN public.wallet_auth.wallet_type IS 'Type of wallet: ethereum or solana';
COMMENT ON COLUMN public.wallet_auth.wallet_address IS 'Ethereum address (0x...) or Solana public key (base58)';
COMMENT ON TABLE public.wallet_auth_rate_limits IS 'Rate limiting for wallet authentication attempts to prevent abuse';

