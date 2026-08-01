-- Secure invitation and courtesy-code redemption for event passes.
-- Raw codes are never persisted: administrators store only SHA-256 hashes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pass_claim_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  code_hash text NOT NULL UNIQUE,
  pass_type public.pass_type NOT NULL DEFAULT 'general',
  max_claims integer NOT NULL DEFAULT 1 CHECK (max_claims > 0),
  claimed_count integer NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (claimed_count <= max_claims)
);

CREATE TABLE IF NOT EXISTS public.pass_code_claims (
  code_id uuid NOT NULL REFERENCES public.pass_claim_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code_id, user_id)
);

ALTER TABLE public.pass_claim_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pass_code_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_event_pass_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code public.pass_claim_codes%ROWTYPE;
  v_code_hash text;
  v_pass_id text;
  v_existing_pass_id text;
  v_max_requests integer;
  v_max_boost integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to claim a pass' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR length(btrim(p_code)) < 6 OR length(btrim(p_code)) > 128 THEN
    RAISE EXCEPTION 'Invalid pass claim code' USING ERRCODE = '22023';
  END IF;

  v_code_hash := encode(digest(upper(btrim(p_code)), 'sha256'), 'hex');
  SELECT * INTO v_code
  FROM public.pass_claim_codes
  WHERE code_hash = v_code_hash
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND OR (v_code.expires_at IS NOT NULL AND v_code.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired pass claim code' USING ERRCODE = '22023';
  END IF;

  SELECT pass_id INTO v_existing_pass_id
  FROM public.pass_code_claims
  WHERE code_id = v_code.id AND user_id = v_user_id;
  IF v_existing_pass_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_claimed',
      'pass_id', v_existing_pass_id,
      'event_id', v_code.event_id
    );
  END IF;

  IF v_code.claimed_count >= v_code.max_claims THEN
    RAISE EXCEPTION 'This pass claim code has reached its limit' USING ERRCODE = '22023';
  END IF;

  SELECT max_requests, max_boost
  INTO v_max_requests, v_max_boost
  FROM public.get_pass_type_limits(v_code.pass_type::text)
  LIMIT 1;

  v_pass_id := gen_random_uuid()::text;
  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status, pass_number,
    max_meeting_requests, used_meeting_requests,
    max_boost_amount, used_boost_amount, access_features, special_perks
  ) VALUES (
    v_pass_id, v_user_id::text, v_code.event_id, v_code.pass_type, 'active',
    'CODE-' || upper(v_code.pass_type::text) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    COALESCE(v_max_requests, 10), 0, COALESCE(v_max_boost, 100), 0,
    CASE v_code.pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE v_code.pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  );

  INSERT INTO public.pass_code_claims (code_id, user_id, pass_id)
  VALUES (v_code.id, v_user_id, v_pass_id);
  UPDATE public.pass_claim_codes
  SET claimed_count = claimed_count + 1
  WHERE id = v_code.id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'pass_id', v_pass_id,
    'event_id', v_code.event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_event_pass_code(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_event_pass_code(text) TO authenticated;

COMMIT;
