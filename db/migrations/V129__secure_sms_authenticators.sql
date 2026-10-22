-- SMS is a restricted authenticator. A number is never accepted as a credential
-- for an account merely because it was entered alongside that account's email.
-- Only a verified, server-side binding can authorize SMS sign-in.
BEGIN;

CREATE TABLE public.user_phone_authenticators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_lookup_hmac text NOT NULL UNIQUE CHECK (phone_lookup_hmac ~ '^[0-9a-f]{64}$'),
  phone_last4 text NOT NULL CHECK (phone_last4 ~ '^[0-9]{4}$'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_lookup_hmac)
);

CREATE INDEX idx_user_phone_authenticators_active_user
  ON public.user_phone_authenticators (user_id)
  WHERE revoked_at IS NULL;

-- A database leak must not expose a usable OTP or the telephone number itself.
-- The API holds the HMAC key (the Supabase service key); the DB sees only lookup
-- and code verifiers plus the final four digits for safe account UI display.
CREATE TABLE public.sms_auth_challenges (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email_lookup_hmac text NOT NULL CHECK (email_lookup_hmac ~ '^[0-9a-f]{64}$'),
  phone_lookup_hmac text NOT NULL CHECK (phone_lookup_hmac ~ '^[0-9a-f]{64}$'),
  phone_last4 text NOT NULL CHECK (phone_last4 ~ '^[0-9]{4}$'),
  purpose text NOT NULL CHECK (purpose IN ('enrollment', 'registration')),
  code_hmac text NOT NULL CHECK (code_hmac ~ '^[0-9a-f]{64}$'),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 5),
  delivery_count smallint NOT NULL DEFAULT 1 CHECK (delivery_count >= 1 AND delivery_count <= 3),
  phone_verified_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((purpose = 'enrollment') = (user_id IS NOT NULL))
);

CREATE INDEX idx_sms_auth_challenges_expiry ON public.sms_auth_challenges (expires_at);
CREATE INDEX idx_sms_auth_challenges_phone ON public.sms_auth_challenges (phone_lookup_hmac, created_at DESC);

-- Limit delivery per phone across every SMS authentication flow. The unique
-- bucket key makes this atomic even when several requests arrive together.
CREATE TABLE public.sms_delivery_rate_limits (
  phone_lookup_hmac text NOT NULL CHECK (phone_lookup_hmac ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count smallint NOT NULL DEFAULT 1 CHECK (request_count > 0 AND request_count <= 3),
  PRIMARY KEY (phone_lookup_hmac)
);

ALTER TABLE public.sms_delivery_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_delivery_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sms_delivery_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.claim_sms_delivery_slot(p_phone_lookup_hmac text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  bucket_start timestamptz := date_trunc('hour', now())
    + (floor(extract(minute FROM now()) / 10) * interval '10 minutes');
BEGIN
  INSERT INTO public.sms_delivery_rate_limits (
    phone_lookup_hmac,
    window_started_at,
    request_count
  ) VALUES (p_phone_lookup_hmac, bucket_start, 1)
  ON CONFLICT (phone_lookup_hmac) DO UPDATE
  SET window_started_at = CASE
        WHEN public.sms_delivery_rate_limits.window_started_at < bucket_start THEN bucket_start
        ELSE public.sms_delivery_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN public.sms_delivery_rate_limits.window_started_at < bucket_start THEN 1
        ELSE public.sms_delivery_rate_limits.request_count + 1
      END
  WHERE public.sms_delivery_rate_limits.window_started_at < bucket_start
    OR public.sms_delivery_rate_limits.request_count < 3;

  RETURN FOUND;
END;
$$;

ALTER TABLE public.user_phone_authenticators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_auth_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_phone_authenticators, public.sms_auth_challenges FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_phone_authenticators, public.sms_auth_challenges TO service_role;

-- Consumes a challenge under a row lock. Failed attempts are counted in the
-- same transaction, preventing concurrent guesses from bypassing the cap.
CREATE OR REPLACE FUNCTION public.consume_sms_auth_challenge(
  p_challenge_id uuid,
  p_user_id uuid,
  p_email_lookup_hmac text,
  p_code_hmac text,
  p_purpose text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  challenge public.sms_auth_challenges;
BEGIN
  SELECT * INTO challenge
  FROM public.sms_auth_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND
    OR challenge.purpose <> p_purpose
    OR challenge.email_lookup_hmac <> p_email_lookup_hmac
    OR (p_user_id IS NOT NULL AND challenge.user_id <> p_user_id)
    OR (p_user_id IS NULL AND challenge.user_id IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF challenge.consumed_at IS NOT NULL OR challenge.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF challenge.attempt_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;

  IF challenge.code_hmac <> p_code_hmac THEN
    UPDATE public.sms_auth_challenges
    SET attempt_count = attempt_count + 1
    WHERE id = challenge.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.sms_auth_challenges
  SET phone_verified_at = now(),
      consumed_at = CASE WHEN challenge.purpose = 'enrollment' THEN now() ELSE consumed_at END
  WHERE id = challenge.id;

  RETURN jsonb_build_object(
    'ok', true,
    'phoneLookupHmac', challenge.phone_lookup_hmac,
    'phoneLast4', challenge.phone_last4
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_sms_registration(
  p_challenge_id uuid,
  p_email_lookup_hmac text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  challenge public.sms_auth_challenges;
  active_phone_count integer;
BEGIN
  SELECT * INTO challenge
  FROM public.sms_auth_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND
    OR challenge.purpose <> 'registration'
    OR challenge.email_lookup_hmac <> p_email_lookup_hmac
    OR challenge.phone_verified_at IS NULL
    OR challenge.consumed_at IS NOT NULL
    OR challenge.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Lock this account's capacity check so concurrent requests cannot bind a
  -- third number. Two active phone authenticators are intentionally allowed.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT count(*) INTO active_phone_count
  FROM public.user_phone_authenticators
  WHERE user_id = p_user_id AND revoked_at IS NULL;
  IF active_phone_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_limit');
  END IF;

  INSERT INTO public.user_phone_authenticators (
    user_id,
    phone_lookup_hmac,
    phone_last4,
    verified_at
  ) VALUES (
    p_user_id,
    challenge.phone_lookup_hmac,
    challenge.phone_last4,
    now()
  ) ON CONFLICT (phone_lookup_hmac) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_unavailable');
  END IF;

  UPDATE public.sms_auth_challenges SET consumed_at = now() WHERE id = challenge.id;
  RETURN jsonb_build_object(
    'ok', true,
    'phoneLookupHmac', challenge.phone_lookup_hmac,
    'phoneLast4', challenge.phone_last4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_sms_auth_challenge(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_sms_registration(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_sms_auth_challenge(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_sms_registration(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_sms_delivery_slot(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sms_delivery_slot(text) TO service_role;

-- New OTPs use a keyed verifier rather than plaintext. Legacy rows remain
-- readable only for their original short expiry, then cleanup_expired_otp_codes
-- removes them normally.
ALTER TABLE public.otp_codes ADD COLUMN IF NOT EXISTS code_hmac text;
ALTER TABLE public.otp_codes ALTER COLUMN code DROP NOT NULL;
ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_codes_code_verifier_check
  CHECK (code_hmac IS NOT NULL OR code IS NOT NULL);

COMMENT ON TABLE public.user_phone_authenticators IS 'Server-only verified SMS authenticators; phone values are keyed HMAC lookups, never plaintext.';
COMMENT ON TABLE public.sms_auth_challenges IS 'Short-lived server-only SMS challenges with keyed OTP verifiers and locked attempt accounting.';
COMMIT;
