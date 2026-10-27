-- V154: Companion email confirmation codes
--
-- The Companion lets a person start with an unconfirmed setup email and confirm it later,
-- either with a short-lived six-digit code or with a long-lived signed link. Only the code
-- uses public.otp_codes (same HMAC-only storage and atomic consume_email_otp as login,
-- account deletion and wallet PIN reset); the link is a stateless signature and needs no row.
BEGIN;

ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN ('email-login', 'account-delete', 'wallet-pin-reset', 'companion-email-confirm'));

COMMIT;
