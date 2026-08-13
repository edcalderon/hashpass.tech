-- V068: repair UUID primary-key insertion in the backend-only pass RPC
--
-- V067 generated a UUID and immediately converted it to text. That works for
-- the legacy text-backed pass table, but PostgreSQL rejects the expression on
-- the canonical UUID-backed passes.id column with SQLSTATE 42804. Keep the
-- public RPC contract text-based while retaining UUID typing for the insert.

BEGIN;

DROP FUNCTION IF EXISTS public.create_default_pass(text, text, text);

CREATE OR REPLACE FUNCTION public.create_default_pass(
  p_user_id text,
  p_pass_type text DEFAULT 'general',
  p_event_id text DEFAULT 'colombia2026'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text := NULLIF(trim(p_event_id), '');
  v_pass_type text := lower(NULLIF(trim(p_pass_type), ''));
  v_existing_id text;
  v_pass_id uuid;
  v_return_id text;
  v_pass_number text := 'BSL-' || upper(v_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_pass_number_type text;
  v_max_requests integer := 10;
  v_max_boost numeric := 100;
BEGIN
  IF NULLIF(trim(p_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL OR v_event_id NOT IN ('bsl2025', 'peru2026', 'chile2026', 'colombia2026') THEN
    RAISE EXCEPTION 'Unsupported BSL event: %', p_event_id USING ERRCODE = '22023';
  END IF;
  IF v_pass_type IS NULL OR v_pass_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'Unsupported pass type: %', p_pass_type USING ERRCODE = '22023';
  END IF;

  IF v_pass_type = 'business' THEN
    v_max_requests := 20;
    v_max_boost := 300;
  ELSIF v_pass_type = 'vip' THEN
    v_max_requests := 50;
    v_max_boost := 500;
  END IF;

  SELECT id::text INTO v_existing_id
  FROM public.passes
  WHERE user_id::text = p_user_id
    AND event_id = v_event_id
    AND pass_type::text = v_pass_type
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  v_pass_id := gen_random_uuid();
  SELECT data_type
  INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'passes'
    AND column_name = 'pass_number';

  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status,
    max_meeting_requests, used_meeting_requests, max_boost_amount,
    used_boost_amount, access_features, special_perks
  ) VALUES (
    v_pass_id, p_user_id, v_event_id, v_pass_type::public.pass_type, 'active',
    v_max_requests, 0, v_max_boost, 0,
    CASE v_pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE v_pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  )
  RETURNING id::text INTO v_return_id;

  IF v_pass_number_type IN ('text', 'character varying') THEN
    EXECUTE 'UPDATE public.passes SET pass_number = $1 WHERE id::text = $2'
      USING v_pass_number, v_return_id;
  END IF;

  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_pass(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_pass(text, text, text) TO service_role;

COMMIT;
