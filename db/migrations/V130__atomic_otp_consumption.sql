-- V130: Atomic, rate-limited consumption for email OTPs
--
-- OTP values remain outside the database.  The verifier compares a keyed HMAC
-- inside a row lock, counts failed attempts, and consumes the row in one
-- transaction so concurrent requests cannot replay a valid code.

BEGIN;

ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'email-login';

ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS attempt_count smallint NOT NULL DEFAULT 0;

ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN ('email-login', 'account-delete'));

ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_attempt_count_check
  CHECK (attempt_count >= 0 AND attempt_count <= 5);

CREATE INDEX IF NOT EXISTS idx_otp_codes_active_purpose
  ON public.otp_codes (email, purpose, created_at DESC)
  WHERE used = false;

CREATE OR REPLACE FUNCTION public.consume_email_otp(
  p_email text,
  p_code_hmac text,
  p_purpose text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  challenge public.otp_codes;
BEGIN
  SELECT * INTO challenge
  FROM public.otp_codes
  WHERE email = p_email
    AND purpose = p_purpose
    AND used = false
    AND expires_at > now()
    AND attempt_count < 5
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF challenge.code_hmac IS NULL OR challenge.code_hmac <> p_code_hmac THEN
    UPDATE public.otp_codes
    SET attempt_count = LEAST(attempt_count + 1, 5)
    WHERE id = challenge.id;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN challenge.attempt_count >= 4 THEN 'locked' ELSE 'invalid' END
    );
  END IF;

  UPDATE public.otp_codes
  SET used = true
  WHERE id = challenge.id;

  RETURN jsonb_build_object(
    'ok', true,
    'tokenHash', challenge.token_hash,
    'email', challenge.email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_email_otp(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_email_otp(text, text, text)
  TO service_role;

COMMIT;
