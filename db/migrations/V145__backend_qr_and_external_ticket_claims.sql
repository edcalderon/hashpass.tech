-- V145: backend-owned pass QR codes and one-time external ticket claims.
--
-- QR data is intentionally kept behind the API boundary. The mobile client
-- never calls these tables or RPCs directly; the service-role API verifies
-- the caller and applies the owner/admin policy before invoking them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  qr_type text NOT NULL DEFAULT 'pass'
    CHECK (qr_type IN ('pass', 'wallet_transfer', 'access_code', 'ticket')),
  pass_id text,
  user_id text NOT NULL,
  associated_entity_id text,
  qr_data jsonb NOT NULL DEFAULT '{}',
  display_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired', 'revoked', 'suspended')),
  expires_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  last_checked_at timestamptz,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0 AND max_uses <= 25),
  admin_notes text,
  revoked_by text,
  revoked_at timestamptz,
  revoked_reason text,
  ip_address text,
  device_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_codes_pass_idx ON public.qr_codes (pass_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS qr_codes_owner_idx ON public.qr_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS qr_codes_status_idx ON public.qr_codes (status, expires_at);

CREATE TABLE IF NOT EXISTS public.qr_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id uuid NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
  token text NOT NULL,
  scanned_by_user_id text,
  scanned_by_device_id text,
  scan_status text NOT NULL,
  scan_message text,
  scan_ip_address text,
  scan_user_agent text,
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_scan_logs_code_idx ON public.qr_scan_logs (qr_code_id, scanned_at DESC);

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scan_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.qr_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.qr_scan_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.qr_codes TO service_role;
GRANT ALL ON TABLE public.qr_scan_logs TO service_role;

CREATE OR REPLACE FUNCTION public.generate_qr_token()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 'QR-' || upper(replace(gen_random_uuid()::text, '-', '')) ||
    upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

CREATE OR REPLACE FUNCTION public.generate_pass_qr(
  p_pass_id text,
  p_expires_in_minutes integer DEFAULT 30,
  p_max_uses integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass record;
  v_qr_id uuid;
  v_token text;
  v_expires integer := least(greatest(coalesce(p_expires_in_minutes, 30), 1), 1440);
  v_max_uses integer := least(greatest(coalesce(p_max_uses, 1), 1), 25);
BEGIN
  IF nullif(btrim(p_pass_id), '') IS NULL THEN
    RAISE EXCEPTION 'A pass id is required' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO v_pass
  FROM public.passes p
  WHERE p.id::text = btrim(p_pass_id)
    AND p.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass not found or not active' USING ERRCODE = '22023';
  END IF;

  v_token := public.generate_qr_token();
  INSERT INTO public.qr_codes (
    token, qr_type, pass_id, user_id, qr_data, display_data,
    expires_at, max_uses
  ) VALUES (
    v_token,
    'pass',
    v_pass.id::text,
    v_pass.user_id::text,
    jsonb_build_object(
      'type', 'hashpass_qr',
      'pass_id', v_pass.id::text,
      'pass_number', v_pass.pass_number::text,
      'pass_type', v_pass.pass_type::text,
      'event_id', v_pass.event_id,
      'issued_at', extract(epoch from now())::bigint
    ),
    jsonb_build_object(
      'pass_number', v_pass.pass_number::text,
      'pass_type', v_pass.pass_type::text,
      'event_id', v_pass.event_id
    ),
    now() + make_interval(mins => v_expires),
    v_max_uses
  ) RETURNING id INTO v_qr_id;

  RETURN v_qr_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_and_use_qr(
  p_token text,
  p_scanner_user_id text DEFAULT NULL,
  p_scanner_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qr public.qr_codes%ROWTYPE;
  v_status text;
  v_message text;
  v_next_count integer;
BEGIN
  SELECT * INTO v_qr
  FROM public.qr_codes
  WHERE token = nullif(btrim(p_token), '')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'message', 'QR code not found');
  END IF;

  IF v_qr.status = 'used' OR v_qr.usage_count >= v_qr.max_uses THEN
    v_status := 'already_used';
    v_message := 'This QR code has already been used';
  ELSIF v_qr.status IN ('revoked', 'suspended') THEN
    v_status := v_qr.status;
    v_message := coalesce(v_qr.revoked_reason, 'QR code is ' || v_qr.status);
  ELSIF v_qr.expires_at IS NOT NULL AND v_qr.expires_at <= now() THEN
    UPDATE public.qr_codes SET status = 'expired', updated_at = now() WHERE id = v_qr.id;
    v_status := 'expired';
    v_message := 'QR code has expired';
  ELSE
    v_status := 'valid';
    v_message := 'QR code is valid';
  END IF;

  IF v_status = 'valid' THEN
    v_next_count := v_qr.usage_count + 1;
    UPDATE public.qr_codes
    SET usage_count = v_next_count,
        used_at = coalesce(used_at, now()),
        last_checked_at = now(),
        status = CASE WHEN v_next_count >= max_uses THEN 'used' ELSE status END,
        updated_at = now()
    WHERE id = v_qr.id;
  ELSE
    v_next_count := v_qr.usage_count;
    UPDATE public.qr_codes SET last_checked_at = now(), updated_at = now() WHERE id = v_qr.id;
  END IF;

  INSERT INTO public.qr_scan_logs (
    qr_code_id, token, scanned_by_user_id, scanned_by_device_id, scan_status, scan_message
  ) VALUES (
    v_qr.id, v_qr.token, p_scanner_user_id, p_scanner_device_id, v_status, v_message
  );

  RETURN jsonb_build_object(
    'valid', v_status = 'valid',
    'status', v_status,
    'message', v_message,
    'qr_data', v_qr.qr_data,
    'display_data', v_qr.display_data,
    'usage_count', v_next_count,
    'max_uses', v_qr.max_uses,
    'used_at', v_qr.used_at,
    'expires_at', v_qr.expires_at,
    'revoked_at', v_qr.revoked_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_qr_code(p_token text, p_admin_user_id text, p_reason text DEFAULT NULL)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.qr_codes
  SET status = 'revoked', revoked_by = p_admin_user_id, revoked_at = now(),
      revoked_reason = nullif(btrim(p_reason), ''), updated_at = now()
  WHERE token = nullif(btrim(p_token), '') AND status = 'active'
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.suspend_qr_code(p_token text, p_admin_user_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.qr_codes SET status = 'suspended', updated_at = now()
  WHERE token = nullif(btrim(p_token), '') AND status = 'active'
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_qr_code(p_token text, p_admin_user_id text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.qr_codes
  SET status = 'active', revoked_by = NULL, revoked_at = NULL, revoked_reason = NULL, updated_at = now()
  WHERE token = nullif(btrim(p_token), '') AND status IN ('revoked', 'suspended')
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.generate_qr_token() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_pass_qr(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_and_use_qr(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_qr_code(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suspend_qr_code(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reactivate_qr_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pass_qr(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_qr_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_and_use_qr(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_qr_code(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.suspend_qr_code(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_qr_code(text, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.external_ticket_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  issuer text NOT NULL DEFAULT 'blockchain_summit_latam',
  claimant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_code_hash text NOT NULL,
  ticket_code_last4 text NOT NULL,
  source_qr_digest text NOT NULL,
  source_qr_payload jsonb NOT NULL DEFAULT '{}',
  source_ticket_metadata jsonb NOT NULL DEFAULT '{}',
  requested_pass_type text NOT NULL DEFAULT 'general'
    CHECK (requested_pass_type IN ('general', 'business', 'vip')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected', 'converted')),
  reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text,
  hashpass_pass_id text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  converted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS external_ticket_claim_code_key
  ON public.external_ticket_claims (issuer, event_id, ticket_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS external_ticket_claim_qr_key
  ON public.external_ticket_claims (source_qr_digest);
CREATE INDEX IF NOT EXISTS external_ticket_claim_user_idx
  ON public.external_ticket_claims (claimant_user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS external_ticket_claim_review_idx
  ON public.external_ticket_claims (status, submitted_at DESC);

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS source_external_ticket_claim_id uuid,
  ADD COLUMN IF NOT EXISTS source_external_ticket_metadata jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS passes_source_external_claim_key
  ON public.passes (source_external_ticket_claim_id)
  WHERE source_external_ticket_claim_id IS NOT NULL;

ALTER TABLE public.external_ticket_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_ticket_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.external_ticket_claims TO service_role;

CREATE OR REPLACE FUNCTION public.submit_external_ticket_claim(
  p_user_id uuid,
  p_event_id text,
  p_issuer text,
  p_ticket_code text,
  p_source_qr_digest text,
  p_source_qr_payload jsonb DEFAULT '{}',
  p_source_ticket_metadata jsonb DEFAULT '{}',
  p_requested_pass_type text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_code text := upper(btrim(coalesce(p_ticket_code, '')));
  v_hash text;
  v_issuer text := lower(nullif(btrim(coalesce(p_issuer, '')), ''));
  v_digest text := nullif(btrim(coalesce(p_source_qr_digest, '')), '');
BEGIN
  IF p_user_id IS NULL OR nullif(btrim(coalesce(p_event_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A user and event are required' USING ERRCODE = '22023';
  END IF;
  IF length(v_code) < 4 OR length(v_code) > 128 THEN
    RAISE EXCEPTION 'A valid original ticket code is required' USING ERRCODE = '22023';
  END IF;
  IF v_issuer IS NULL OR v_digest IS NULL THEN
    RAISE EXCEPTION 'The original ticket issuer and QR proof are required' USING ERRCODE = '22023';
  END IF;
  IF p_requested_pass_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'Unsupported requested pass type' USING ERRCODE = '22023';
  END IF;

  v_hash := encode(digest(v_code, 'sha256'), 'hex');
  SELECT * INTO v_claim
  FROM public.external_ticket_claims
  WHERE (issuer = v_issuer AND event_id = p_event_id AND ticket_code_hash = v_hash)
     OR source_qr_digest = v_digest
  FOR UPDATE;
  IF FOUND THEN
    IF v_claim.claimant_user_id <> p_user_id THEN
      RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id);
  END IF;

  INSERT INTO public.external_ticket_claims (
    event_id, issuer, claimant_user_id, ticket_code_hash, ticket_code_last4,
    source_qr_digest, source_qr_payload, source_ticket_metadata, requested_pass_type
  ) VALUES (
    lower(btrim(p_event_id)), v_issuer, p_user_id, v_hash, right(v_code, 4),
    v_digest, coalesce(p_source_qr_payload, '{}'), coalesce(p_source_ticket_metadata, '{}'),
    p_requested_pass_type
  ) RETURNING * INTO v_claim;

  RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_external_ticket_claim(
  p_claim_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_pass_type text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_pass jsonb;
  v_pass_id text;
  v_type text := lower(nullif(btrim(coalesce(p_pass_type, '')), ''));
BEGIN
  SELECT * INTO v_claim FROM public.external_ticket_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket claim not found' USING ERRCODE = '22023'; END IF;
  IF v_claim.status IN ('rejected', 'converted') THEN
    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id);
  END IF;
  IF p_action = 'reject' THEN
    UPDATE public.external_ticket_claims
    SET status = 'rejected', reviewer_user_id = p_actor_user_id, reviewer_note = p_note, reviewed_at = now()
    WHERE id = v_claim.id;
    RETURN jsonb_build_object('id', v_claim.id, 'status', 'rejected', 'pass_id', NULL);
  END IF;
  IF p_action <> 'approve' THEN
    RAISE EXCEPTION 'Unsupported claim review action' USING ERRCODE = '22023';
  END IF;
  v_type := coalesce(v_type, v_claim.requested_pass_type);
  IF v_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'A valid pass type is required' USING ERRCODE = '22023';
  END IF;

  -- Reuse the event-scoped pass provisioning contract so imported tickets get
  -- exactly the same limits and access arrays as native HashPass passes.
  SELECT public.admin_mutate_event_pass(
    p_actor_user_id, v_claim.event_id, 'create', v_claim.claimant_user_id, NULL, v_type, NULL
  ) INTO v_pass;
  v_pass_id := v_pass->>'id';
  IF nullif(v_pass_id, '') IS NULL THEN
    RAISE EXCEPTION 'Unable to create the HashPass equivalent pass' USING ERRCODE = '22023';
  END IF;

  UPDATE public.passes
  SET source_external_ticket_claim_id = v_claim.id,
      source_external_ticket_metadata = v_claim.source_ticket_metadata,
      updated_at = now()
  WHERE id::text = v_pass_id;

  UPDATE public.external_ticket_claims
  SET status = 'converted', reviewer_user_id = p_actor_user_id, reviewer_note = p_note,
      reviewed_at = now(), converted_at = now(), hashpass_pass_id = v_pass_id
  WHERE id = v_claim.id;

  RETURN jsonb_build_object('id', v_claim.id, 'status', 'converted', 'pass_id', v_pass_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_external_ticket_claim(uuid, text, text, text, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_external_ticket_claim(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_external_ticket_claim(uuid, text, text, text, text, jsonb, jsonb, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.review_external_ticket_claim(uuid, uuid, text, text, text)
  TO service_role;

COMMIT;
