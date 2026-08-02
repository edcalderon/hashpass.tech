-- Managed event pass-claim codes.
--
-- Extends V030 with unlimited campaign codes, labels suitable for operations,
-- seeded BSL 2026 General promotions, and one auditable administrator RPC.
-- Raw code values are accepted only at creation/redemption time and are never
-- persisted; the database stores a SHA-256 hash exclusively.

BEGIN;

ALTER TABLE public.pass_claim_codes
  ADD COLUMN IF NOT EXISTS label text;

UPDATE public.pass_claim_codes
SET label = COALESCE(NULLIF(label, ''), event_id || ' ' || upper(pass_type::text) || ' pass code')
WHERE label IS NULL OR label = '';

ALTER TABLE public.pass_claim_codes
  ALTER COLUMN label SET NOT NULL;

-- NULL means an unlimited campaign. A claim is still limited to one use per
-- account by pass_code_claims(code_id, user_id), preventing repeat grants.
ALTER TABLE public.pass_claim_codes
  DROP CONSTRAINT IF EXISTS pass_claim_codes_max_claims_check,
  DROP CONSTRAINT IF EXISTS pass_claim_codes_claimed_count_check,
  DROP CONSTRAINT IF EXISTS pass_claim_codes_check;

ALTER TABLE public.pass_claim_codes
  ALTER COLUMN max_claims DROP NOT NULL;

ALTER TABLE public.pass_claim_codes
  ADD CONSTRAINT pass_claim_codes_max_claims_check
  CHECK (max_claims IS NULL OR max_claims > 0),
  ADD CONSTRAINT pass_claim_codes_claimed_count_check
  CHECK (claimed_count >= 0 AND (max_claims IS NULL OR claimed_count <= max_claims));

CREATE INDEX IF NOT EXISTS idx_pass_claim_codes_event_active
  ON public.pass_claim_codes(event_id, is_active, created_at DESC);

-- Public, reusable BSL General Pass promotions. The values below are hashes;
-- do not add a raw code column when creating campaigns.
INSERT INTO public.pass_claim_codes (
  event_id, code_hash, label, pass_type, max_claims, is_active
) VALUES
  (
    'chile2026',
    encode(digest('BSL2026CHILE', 'sha256'), 'hex'),
    'BSL Chile 2026 General promotion',
    'general',
    NULL,
    true
  ),
  (
    'colombia2026',
    encode(digest('BSL2026COLOMBIA', 'sha256'), 'hex'),
    'BSL Colombia 2026 General promotion',
    'general',
    NULL,
    true
  )
ON CONFLICT (code_hash) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_manage_event_pass_claim_code(
  p_actor_user_id uuid,
  p_event_id text,
  p_action text,
  p_code text DEFAULT NULL,
  p_label text DEFAULT NULL,
  p_pass_type text DEFAULT NULL,
  p_max_claims integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_code_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code_id uuid;
  v_normalized_code text;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create' THEN
    v_normalized_code := upper(btrim(COALESCE(p_code, '')));
    IF v_normalized_code !~ '^[A-Z0-9][A-Z0-9_-]{5,127}$' THEN
      RAISE EXCEPTION 'Pass code must be 6-128 characters: letters, numbers, hyphen, or underscore' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(length(btrim(p_label)), 0) = 0 OR length(btrim(p_label)) > 160 THEN
      RAISE EXCEPTION 'A pass-code label of up to 160 characters is required' USING ERRCODE = '22023';
    END IF;
    IF p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'A valid pass type is required' USING ERRCODE = '22023';
    END IF;
    IF p_max_claims IS NOT NULL AND p_max_claims < 1 THEN
      RAISE EXCEPTION 'The claim limit must be positive or unlimited' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
      RAISE EXCEPTION 'The expiry must be in the future' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pass_claim_codes (
      event_id, code_hash, label, pass_type, max_claims, expires_at, is_active, created_by
    ) VALUES (
      p_event_id,
      encode(digest(v_normalized_code, 'sha256'), 'hex'),
      btrim(p_label),
      p_pass_type::public.pass_type,
      p_max_claims,
      p_expires_at,
      true,
      p_actor_user_id
    ) RETURNING id INTO v_code_id;

  ELSIF p_action IN ('deactivate', 'reactivate') THEN
    IF p_code_id IS NULL THEN
      RAISE EXCEPTION 'A pass-code id is required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.pass_claim_codes
    SET is_active = p_action = 'reactivate'
    WHERE id = p_code_id AND event_id = p_event_id
    RETURNING id INTO v_code_id;

    IF v_code_id IS NULL THEN
      RAISE EXCEPTION 'Pass code does not belong to the requested event' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported pass-code action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    p_event_id,
    'pass_code.' || p_action,
    'pass_claim_code',
    v_code_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'label', NULLIF(btrim(COALESCE(p_label, '')), ''),
      'pass_type', p_pass_type,
      'max_claims', p_max_claims,
      'expires_at', p_expires_at
    ))
  );

  RETURN jsonb_build_object('id', v_code_id, 'status', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_event_pass_claim_code(
  uuid, text, text, text, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_event_pass_claim_code(
  uuid, text, text, text, text, text, integer, timestamptz, uuid
) TO service_role;

COMMIT;
