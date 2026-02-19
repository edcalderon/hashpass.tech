-- Create table to store OTP code mappings
-- Maps 6-digit codes to Supabase token_hashes for verification

CREATE TABLE IF NOT EXISTS public.otp_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL, -- 6-digit code sent to user
    token_hash TEXT NOT NULL, -- Supabase token_hash for verification
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, code, token_hash)
);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_otp_codes_email_code ON public.otp_codes(email, code);
CREATE INDEX IF NOT EXISTS idx_otp_codes_token_hash ON public.otp_codes(token_hash);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON public.otp_codes(expires_at);

-- Enable RLS
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Service role can manage all OTP codes
CREATE POLICY "Service role can manage OTP codes" ON public.otp_codes
    FOR ALL USING (auth.role() = 'service_role');

-- Function to clean up expired OTP codes
CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM public.otp_codes
    WHERE expires_at < NOW() OR used = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE public.otp_codes IS 'Maps 6-digit OTP codes to Supabase token_hashes for email OTP authentication';
COMMENT ON COLUMN public.otp_codes.code IS '6-digit code sent to user via email';
COMMENT ON COLUMN public.otp_codes.token_hash IS 'Supabase token_hash used for verification';

