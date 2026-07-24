-- ============================================================================
-- V010: Provision general passes for upcoming BSL tour stops
-- ============================================================================
-- The legacy create_default_pass(text, text) function derives its event from
-- a session setting and otherwise falls back to bsl2025. Supabase RPC calls do
-- not set that session value, so the client could never create a pass for an
-- explicit upcoming event. Keep that legacy overload for older clients and
-- add a three-argument overload for event-aware callers.
--
-- A confirmed Supabase account receives one active General Pass for BSL Chile
-- 2026 and BSL Colombia 2026. The function is idempotent and transaction-locks
-- each user/event pair, so trigger retries and concurrent app bootstrap calls
-- do not create duplicate active passes.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_default_pass(
  p_user_id text,
  p_pass_type text,
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
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_event_id NOT IN ('bsl2025', 'peru2026', 'chile2026', 'colombia2026') THEN
    RAISE EXCEPTION 'Unsupported BSL event: %', p_event_id USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hashpass:pass:' || p_user_id || ':' || p_event_id, 0));

  SELECT id
  INTO v_existing_id
  FROM public.passes
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND pass_type = p_pass_type::pass_type
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT max_requests, max_boost
  INTO v_max_requests, v_max_boost
  FROM public.get_pass_type_limits(p_pass_type)
  LIMIT 1;

  -- Development's legacy passes table does not define an id default, while
  -- production does. Generate a portable text id so both schemas can create
  -- the same event-aware pass.
  v_pass_id := 'BSL-' || upper(p_event_id) || '-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.passes (
    id,
    user_id,
    event_id,
    pass_type,
    status,
    pass_number,
    max_meeting_requests,
    used_meeting_requests,
    max_boost_amount,
    used_boost_amount,
    access_features,
    special_perks
  ) VALUES (
    v_pass_id,
    p_user_id,
    p_event_id,
    p_pass_type::pass_type,
    'active',
    'BSL-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    COALESCE(v_max_requests, 10),
    0,
    COALESCE(v_max_boost, 100),
    0,
    CASE p_pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE p_pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  )
  RETURNING id INTO v_pass_id;

  RETURN v_pass_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_default_pass(text, text, text)
  TO anon, authenticated, service_role;

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

  PERFORM public.create_default_pass(NEW.id::text, 'general', 'chile2026');
  PERFORM public.create_default_pass(NEW.id::text, 'general', 'colombia2026');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_upcoming_bsl_general_passes ON auth.users;
CREATE TRIGGER trg_auth_users_upcoming_bsl_general_passes
  AFTER INSERT OR UPDATE OF email_confirmed_at, confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_upcoming_bsl_general_passes();

DO $$
DECLARE
  user_record record;
BEGIN
  FOR user_record IN
    SELECT id
    FROM auth.users
    WHERE email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL
  LOOP
    PERFORM public.create_default_pass(user_record.id::text, 'general', 'chile2026');
    PERFORM public.create_default_pass(user_record.id::text, 'general', 'colombia2026');
  END LOOP;
END;
$$;

COMMIT;
