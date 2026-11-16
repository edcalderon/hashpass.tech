-- Email is used only to confirm ownership during authenticator-app enrollment.
BEGIN;

ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN (
    'email-login',
    'account-delete',
    'wallet-pin-reset',
    'companion-email-confirm',
    'wallet-authenticator-setup'
  ));

COMMIT;
