-- V131: Retire legacy plaintext OTP storage
--
-- The active auth APIs use code_hmac and atomic database consumers.  Rows
-- created by the pre-V129 flow are no longer verifiable by the application and
-- may contain a plaintext six-digit code, so remove them before removing the
-- legacy column and indexes.

BEGIN;

DELETE FROM public.otp_codes
WHERE code_hmac IS NULL
   OR used IS TRUE
   OR expires_at <= now();

ALTER TABLE public.otp_codes
  DROP CONSTRAINT IF EXISTS otp_codes_email_code_token_hash_key;

DROP INDEX IF EXISTS public.idx_otp_codes_email_code;
DROP INDEX IF EXISTS public.idx_otp_codes_token_hash;

ALTER TABLE public.otp_codes
  DROP COLUMN IF EXISTS code;

COMMENT ON TABLE public.otp_codes IS
  'Canonical server-only email OTP challenges. Raw OTP codes are never stored; code_hmac is consumed atomically by consume_email_otp.';
COMMENT ON COLUMN public.otp_codes.code_hmac IS
  'HMAC-SHA256 verifier for the short-lived code; keyed with the server service secret and never exposed to clients.';
COMMENT ON COLUMN public.otp_codes.token_hash IS
  'Server-only GoTrue token material required to exchange a verified OTP for a session.';

COMMIT;
