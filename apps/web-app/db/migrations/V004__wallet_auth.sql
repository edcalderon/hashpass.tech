-- ============================================================================
-- V004: Wallet Authentication
-- ============================================================================
-- Supports Ethereum and Solana wallet sign-in.
-- ============================================================================

DO $$
BEGIN
  CREATE TYPE wallet_type AS ENUM ('ethereum', 'solana');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.wallet_auth (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_type wallet_type NOT NULL,
  wallet_address text NOT NULL,
  nonce text,
  nonce_expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(wallet_type, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_wallet_auth_user_id ON public.wallet_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_auth_address ON public.wallet_auth(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_auth_type_address ON public.wallet_auth(wallet_type, wallet_address);

ALTER TABLE public.wallet_auth ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own wallets" ON public.wallet_auth;
CREATE POLICY "Users can view their own wallets" ON public.wallet_auth
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert their own wallets" ON public.wallet_auth;
CREATE POLICY "Users can insert their own wallets" ON public.wallet_auth
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update their own wallets" ON public.wallet_auth;
CREATE POLICY "Users can update their own wallets" ON public.wallet_auth
  FOR UPDATE USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Service role can manage all wallets" ON public.wallet_auth;
CREATE POLICY "Service role can manage all wallets" ON public.wallet_auth
  FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.wallet_auth_rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  wallet_type wallet_type NOT NULL,
  ip_address text,
  attempt_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  blocked_until timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(wallet_address, wallet_type, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_wallet_rate_limit_lookup
  ON public.wallet_auth_rate_limits(wallet_address, wallet_type, ip_address, window_start);

ALTER TABLE public.wallet_auth_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.wallet_auth_rate_limits;
CREATE POLICY "Service role can manage rate limits" ON public.wallet_auth_rate_limits
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM public.wallet_auth_rate_limits
  WHERE (window_start < now() - interval '1 hour' AND blocked_until IS NULL)
     OR (blocked_until IS NOT NULL AND blocked_until < now());
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_wallet_auth_rate_limit(
  p_wallet_address text,
  p_wallet_type wallet_type,
  p_ip_address text,
  p_max_attempts integer DEFAULT 5,
  p_window_minutes integer DEFAULT 5,
  p_block_duration_minutes integer DEFAULT 15
)
RETURNS TABLE(
  allowed boolean,
  remaining_attempts integer,
  blocked_until timestamptz
) AS $$
DECLARE
  v_record record;
  v_window_start timestamptz;
BEGIN
  PERFORM cleanup_expired_rate_limits();

  SELECT * INTO v_record
  FROM public.wallet_auth_rate_limits
  WHERE wallet_address = p_wallet_address
    AND wallet_type = p_wallet_type
    AND (ip_address = p_ip_address OR ip_address IS NULL OR p_ip_address IS NULL)
  FOR UPDATE;

  v_window_start := now() - (p_window_minutes || ' minutes')::interval;

  IF v_record IS NULL THEN
    INSERT INTO public.wallet_auth_rate_limits (wallet_address, wallet_type, ip_address, attempt_count, window_start)
    VALUES (p_wallet_address, p_wallet_type, p_ip_address, 1, now())
    ON CONFLICT (wallet_address, wallet_type, ip_address) DO NOTHING;

    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::timestamptz;
  ELSIF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > now() THEN
    RETURN QUERY SELECT false, 0, v_record.blocked_until;
  ELSIF v_record.window_start < v_window_start THEN
    UPDATE public.wallet_auth_rate_limits
    SET attempt_count = 1, window_start = now(), blocked_until = NULL
    WHERE id = v_record.id;

    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::timestamptz;
  ELSIF v_record.attempt_count >= p_max_attempts THEN
    UPDATE public.wallet_auth_rate_limits
    SET blocked_until = now() + (p_block_duration_minutes || ' minutes')::interval
    WHERE id = v_record.id;

    RETURN QUERY SELECT false, 0, now() + (p_block_duration_minutes || ' minutes')::interval;
  ELSE
    UPDATE public.wallet_auth_rate_limits
    SET attempt_count = attempt_count + 1
    WHERE id = v_record.id;

    RETURN QUERY SELECT true, p_max_attempts - v_record.attempt_count - 1, NULL::timestamptz;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wallet_auth_updated_at ON public.wallet_auth;
CREATE TRIGGER update_wallet_auth_updated_at
  BEFORE UPDATE ON public.wallet_auth
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.wallet_auth IS 'Wallet addresses linked to user accounts for authentication';
COMMENT ON TABLE public.wallet_auth_rate_limits IS 'Rate limiting for wallet authentication attempts';
