-- ============================================================================
-- V077: Auto-provision a CriptoLatinFest general pass, same as chile2026/colombia2026
-- ============================================================================
-- Extends the existing upcoming-BSL-general-pass mechanism
-- (create_upcoming_bsl_general_pass_for_user / trg_auth_users_upcoming_bsl_general_passes,
-- see V010/V011/V021/V037) to also cover the criptolatinfest demo event, so
-- any newly confirmed account gets a free general pass for it automatically,
-- the same way chile2026/colombia2026 already work. Reuses the existing
-- trigger/function rather than adding a parallel mechanism.
-- ============================================================================

BEGIN;

-- Seed a free "general" tier for criptolatinfest -- required because
-- create_upcoming_bsl_general_pass_for_user looks up
-- public.event_pass_tiers(event_id, 'general') and raises if it's missing.
-- price_cents = 0: this is a demo event for a prospective client, not a real
-- paid tier (see EventConfig.isDemo / V076).
INSERT INTO public.event_pass_tiers (
  event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
)
VALUES
  ('criptolatinfest', 'general', 10, 100, 0, 'USD', NULL),
  ('criptolatinfest', 'business', 20, 300, 0, 'USD', NULL),
  ('criptolatinfest', 'vip', 50, 500, 0, 'USD', 'Demo Access')
ON CONFLICT (event_id, pass_type) DO NOTHING;

-- Same body as V037's version, plus criptolatinfest in the allowed list and
-- an event-prefixed pass number instead of a hardcoded "BSL-" prefix (this
-- function now issues passes for a non-BSL event too). Also made schema-
-- adaptive for passes.id/pass_number: BSL production has both as text, but
-- bsl-development (confirmed live, 2026-08-14) has id as uuid and
-- pass_number as integer -- the same class of dev/prod schema divergence
-- already hit and fixed elsewhere (V068/V069/V050/V051). Detects each
-- column's real type via information_schema and builds the right literal,
-- instead of assuming one shape like the version this replaces did.
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
  v_existing_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
  v_id_type text;
  v_pass_number_type text;
  v_id_value text;
  v_pass_number_value text;
BEGIN
  IF p_event_id NOT IN ('chile2026', 'colombia2026', 'criptolatinfest') THEN
    RAISE EXCEPTION 'Unsupported upcoming general-pass event: %', p_event_id USING ERRCODE = '22023';
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

  SELECT *
  INTO v_tier
  FROM public.event_pass_tiers
  WHERE event_id = p_event_id
    AND pass_type = 'general';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
  END IF;

  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'id';

  SELECT data_type INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number';

  v_id_value := gen_random_uuid()::text;

  v_pass_number_value := CASE
    WHEN v_pass_number_type IN ('integer', 'bigint', 'smallint') THEN
      (trunc(random() * 900000000 + 100000000))::bigint::text
    ELSE
      upper(p_event_id) || '-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  END;

  EXECUTE format(
    'INSERT INTO public.passes (
       id, user_id, event_id, pass_type, status, pass_number,
       max_meeting_requests, used_meeting_requests,
       max_boost_amount, used_boost_amount, access_features, special_perks
     ) VALUES (
       %L%s, $1, $2, ''general''::public.pass_type, ''active'', %L%s,
       $3, 0, $4, 0, $5, $6
     ) RETURNING id::text',
    v_id_value, CASE WHEN v_id_type = 'uuid' THEN '::uuid' ELSE '' END,
    v_pass_number_value, CASE WHEN v_pass_number_type IN ('integer', 'bigint', 'smallint') THEN '::' || v_pass_number_type ELSE '' END
  )
  INTO v_pass_id
  USING p_user_id::text, p_event_id, v_tier.max_meeting_requests, v_tier.max_boost_amount,
    ARRAY['general_sessions'], ARRAY['basic_swag'];

  RETURN v_pass_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_upcoming_bsl_general_pass_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Same body as V021's version, plus the criptolatinfest call.
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
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'criptolatinfest');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_upcoming_bsl_general_passes ON auth.users;
CREATE TRIGGER trg_auth_users_upcoming_bsl_general_passes
  AFTER INSERT OR UPDATE OF email_confirmed_at, confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_upcoming_bsl_general_passes();

-- Backfill: every already-confirmed account gets a criptolatinfest general
-- pass too (chile2026/colombia2026 already have theirs from V021/V037).
DO $$
DECLARE
  user_record record;
BEGIN
  FOR user_record IN
    SELECT id
    FROM auth.users
    WHERE email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL
  LOOP
    PERFORM public.create_upcoming_bsl_general_pass_for_user(user_record.id, 'criptolatinfest');
  END LOOP;
END;
$$;

COMMIT;
