-- V092: Enable CBWeek passes and backfill verified attendees without downgrading existing passes.

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
  v_access_features text[] := ARRAY['general_sessions'];
  v_special_perks text[] := ARRAY['basic_swag'];
BEGIN
  IF NULLIF(trim(p_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL OR v_event_id NOT IN ('bsl2025', 'peru2026', 'chile2026', 'colombia2026', 'cbweek2026') THEN
    RAISE EXCEPTION 'Unsupported pass event: %', p_event_id USING ERRCODE = '22023';
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

  IF v_pass_type = 'business' THEN
    v_access_features := ARRAY['all_sessions', 'networking', 'business_events'];
    v_special_perks := ARRAY['business_lounge', 'networking_tools'];
  ELSIF v_pass_type = 'vip' THEN
    v_access_features := ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'];
    v_special_perks := ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag'];
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:pass:' || p_user_id || ':' || v_event_id || ':' || CASE WHEN v_event_id = 'cbweek2026' THEN 'general' ELSE v_pass_type END, 0)
  );

  SELECT id::text
  INTO v_existing_id
  FROM public.passes
  WHERE user_id::text = p_user_id
    AND event_id = v_event_id
    AND (pass_type::text = v_pass_type OR v_event_id = 'cbweek2026')
    AND (status = 'active' OR v_event_id = 'cbweek2026')
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  SELECT max_meeting_requests, max_boost_amount
  INTO v_max_requests, v_max_boost
  FROM public.event_pass_tiers
  WHERE event_id = v_event_id AND pass_type = v_pass_type AND v_event_id = 'cbweek2026';
  v_max_requests := COALESCE(v_max_requests, CASE v_pass_type WHEN 'vip' THEN 50 WHEN 'business' THEN 20 ELSE 10 END);
  v_max_boost := COALESCE(v_max_boost, CASE v_pass_type WHEN 'vip' THEN 500 WHEN 'business' THEN 300 ELSE 100 END);

  v_pass_id := gen_random_uuid();
  SELECT data_type
  INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'passes'
    AND column_name = 'pass_number';

  IF v_pass_number_type IN ('text', 'character varying') THEN
    EXECUTE '
      INSERT INTO public.passes (
        id, user_id, event_id, pass_type, status, pass_number,
        max_meeting_requests, used_meeting_requests, max_boost_amount,
        used_boost_amount, access_features, special_perks
      ) VALUES (
        $1, $2, $3, $4::public.pass_type, ''active'', $5,
        $6, 0, $7, 0,
        $8, $9
      )
      RETURNING id::text'
    INTO v_return_id
    USING v_pass_id, p_user_id, v_event_id, v_pass_type, v_pass_number,
      v_max_requests, v_max_boost, v_access_features, v_special_perks;
  ELSE
    INSERT INTO public.passes (
      id, user_id, event_id, pass_type, status,
      max_meeting_requests, used_meeting_requests, max_boost_amount,
      used_boost_amount, access_features, special_perks
    ) VALUES (
      v_pass_id, p_user_id, v_event_id, v_pass_type::public.pass_type, 'active',
      v_max_requests, 0, v_max_boost, 0,
      v_access_features, v_special_perks
    )
    RETURNING id::text INTO v_return_id;
  END IF;

  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_pass(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_pass(text, text, text) TO service_role;

-- Keep CBWeek separate from the legacy BSL/demo trigger so neither rule
-- can accidentally remove the other's entitlements in a later migration.
CREATE OR REPLACE FUNCTION public.provision_cbweek_general_pass()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events WHERE id = 'cbweek2026' AND status = 'published'
  ) THEN
    PERFORM public.create_default_pass(NEW.id::text, 'general', 'cbweek2026');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_cbweek_general_pass() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_users_cbweek_general_pass ON auth.users;
CREATE TRIGGER trg_auth_users_cbweek_general_pass
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_cbweek_general_pass();

DO $$
DECLARE v_user record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = 'cbweek2026' AND status = 'published') THEN
    FOR v_user IN SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL LOOP
      PERFORM public.create_default_pass(v_user.id::text, 'general', 'cbweek2026');
    END LOOP;
  END IF;
END;
$$;

COMMIT;
