-- V138: Wallet PIN recovery
--
-- A person who forgot their PIN proves control of their email with a single-use code
-- (purpose 'wallet-pin-reset', same HMAC-only storage and atomic consume_email_otp as
-- login and account deletion), then replaces the PIN verifier. The wallet seed is not
-- touched here: the client re-wraps its vault under the new PIN using the recovery
-- phrase, because the old PIN is not available. The server never re-wraps on its own.
BEGIN;

ALTER TABLE public.otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;
ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose IN ('email-login', 'account-delete', 'wallet-pin-reset'));

-- Overwrites the verifier and clears attempts and lockout. Callable only by the API's
-- service role, and the API calls it only behind a `wallet:recover` proof.
CREATE FUNCTION public.reset_user_pin(p_user_id uuid, p_verifier text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_verifier IS NULL OR p_verifier !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_pin_request' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.user_pin(user_id, verifier) VALUES (p_user_id, decode(p_verifier, 'hex'))
    ON CONFLICT (user_id) DO UPDATE SET
      verifier = excluded.verifier, failed_attempts = 0, locked_until = NULL,
      set_at = now(), updated_at = now();
  RETURN jsonb_build_object('ok', true, 'enabled', true, 'remainingAttempts', 5, 'lockedUntil', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_user_pin(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_pin(uuid, text) TO service_role;

COMMIT;
