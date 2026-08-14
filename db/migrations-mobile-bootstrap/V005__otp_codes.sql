-- ============================================================================
-- V005: OTP Codes
-- ============================================================================
-- Maps short verification codes to Supabase token hashes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  code text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email, code, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_email_code ON public.otp_codes(email, code);
CREATE INDEX IF NOT EXISTS idx_otp_codes_token_hash ON public.otp_codes(token_hash);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage OTP codes" ON public.otp_codes;
CREATE POLICY "Service role can manage OTP codes" ON public.otp_codes
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM public.otp_codes
  WHERE expires_at < now() OR used = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.otp_codes IS 'Maps 6-digit OTP codes to Supabase token_hashes for email OTP authentication';
COMMENT ON COLUMN public.otp_codes.code IS '6-digit code sent to user via email';
COMMENT ON COLUMN public.otp_codes.token_hash IS 'Supabase token_hash used for verification';
