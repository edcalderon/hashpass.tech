-- ============================================================================
-- V088: Automatically grant a courtesy General pass for demo events
-- ============================================================================
-- Demo tenants live only in the BSL development database. Every newly
-- confirmed user receives exactly one active General pass for every published
-- demo event. The current CBWeek tenant is intentionally is_demo = false and
-- is therefore excluded from this courtesy provisioning rule.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_demo_general_pass_for_user(
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
  v_event_id text;
  v_id_type text;
  v_pass_number_type text;
  v_id_value text;
  v_pass_number_value text;
BEGIN
  SELECT e.id
  INTO v_event_id
  FROM public.events e
  WHERE e.id = p_event_id
    AND e.is_demo
    AND e.status = 'published';

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Courtesy demo pass requested for an unpublished or non-demo event: %', p_event_id
      USING ERRCODE = '22023';
  END IF;

  -- A transaction-scoped lock plus the existing-pass check makes repeated
  -- confirmation updates and concurrent OAuth callbacks safe and idempotent.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:demo-pass:' || p_user_id::text || ':' || p_event_id, 0)
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

  -- A future demo event needs no one-off SQL to become usable. Organizers may
  -- configure richer limits later; an existing General tier is never replaced.
  INSERT INTO public.event_pass_tiers (
    event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
  ) VALUES (
    p_event_id, 'general', 10, 100, 0, 'USD', 'Demo courtesy pass'
  )
  ON CONFLICT (event_id, pass_type) DO NOTHING;

  SELECT *
  INTO v_tier
  FROM public.event_pass_tiers
  WHERE event_id = p_event_id
    AND pass_type = 'general';

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

REVOKE ALL ON FUNCTION public.create_demo_general_pass_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provision_upcoming_bsl_general_passes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demo_event record;
BEGIN
  IF NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Preserve the standard BSL entitlements.
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'chile2026');
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'colombia2026');

  -- New and future published demo events automatically participate.
  FOR v_demo_event IN
    SELECT e.id
    FROM public.events e
    WHERE e.is_demo
      AND e.status = 'published'
  LOOP
    PERFORM public.create_demo_general_pass_for_user(NEW.id, v_demo_event.id);
  END LOOP;

  RETURN NEW;
END;
$$;

-- This rule intentionally applies on future confirmed signups only. Existing
-- accounts are not backfilled into demo tenants without organizer approval.

COMMIT;
