-- ============================================================================
-- V011: Restrict BSL pass minting to the authenticated pass holder
-- ============================================================================
-- V010 introduced an event-aware RPC. This follow-up separates the privileged
-- provisioning primitive used by auth triggers/backfills from the public RPC:
-- clients may mint only their own General pass for an upcoming BSL event.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_upcoming_bsl_general_pass_for_user(
  p_user_id uuid,
  p_event_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass_id text;
  v_max_requests integer;
  v_max_boost integer;
  v_existing_id text;
BEGIN
  IF p_event_id NOT IN ('chile2026', 'colombia2026') THEN
    RAISE EXCEPTION 'Unsupported upcoming BSL event: %', p_event_id USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:pass:' || p_user_id::text || ':' || p_event_id, 0)
  );

  SELECT id::text
  INTO v_existing_id
  FROM public.passes
  WHERE user_id::text = p_user_id::text
    AND event_id = p_event_id
    AND pass_type = 'general'::pass_type
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT max_requests, max_boost
  INTO v_max_requests, v_max_boost
  FROM public.get_pass_type_limits('general')
  LIMIT 1;

  -- Valid for both V001's uuid primary key and legacy text primary keys.
  v_pass_id := gen_random_uuid()::text;

  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status, pass_number,
    max_meeting_requests, used_meeting_requests,
    max_boost_amount, used_boost_amount, access_features, special_perks
  ) VALUES (
    v_pass_id, p_user_id::text, p_event_id, 'general'::pass_type, 'active',
    'BSL-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    COALESCE(v_max_requests, 10), 0, COALESCE(v_max_boost, 100), 0,
    ARRAY['general_sessions'], ARRAY['basic_swag']
  )
  RETURNING id::text INTO v_pass_id;

  RETURN v_pass_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_upcoming_bsl_general_pass_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_default_pass(
  p_user_id text,
  p_pass_type text,
  p_event_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid()::text <> p_user_id THEN
    RAISE EXCEPTION 'A pass may only be created for the authenticated user' USING ERRCODE = '42501';
  END IF;

  IF p_pass_type <> 'general' THEN
    RAISE EXCEPTION 'Self-service pass creation only supports general passes' USING ERRCODE = '42501';
  END IF;

  RETURN public.create_upcoming_bsl_general_pass_for_user(auth.uid(), p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_pass(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_default_pass(text, text, text)
  TO authenticated;

-- Retire the older caller-controlled overloads from browser roles. Trusted
-- server-side maintenance scripts retain their service_role access.
DO $$
DECLARE
  v_function regprocedure;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_default_pass'
      AND p.oid <> 'public.create_default_pass(text, text, text)'::regprocedure
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_upcoming_bsl_general_passes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'chile2026');
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'colombia2026');
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  user_record record;
BEGIN
  FOR user_record IN
    SELECT id
    FROM auth.users
    WHERE email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL
  LOOP
    PERFORM public.create_upcoming_bsl_general_pass_for_user(user_record.id, 'chile2026');
    PERFORM public.create_upcoming_bsl_general_pass_for_user(user_record.id, 'colombia2026');
  END LOOP;
END;
$$;

COMMIT;
