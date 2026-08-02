-- Default BSL passes are issued both by the self-service RPC and by the
-- verified-signup trigger.  Use the same event tier catalog as administrator
-- allocations and pass-code claims so each issuance path grants identical
-- meeting and boost entitlements.

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
  v_existing_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
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

  SELECT *
  INTO v_tier
  FROM public.event_pass_tiers
  WHERE event_id = p_event_id
    AND pass_type = 'general';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
  END IF;

  v_pass_id := gen_random_uuid()::text;

  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status, pass_number,
    max_meeting_requests, used_meeting_requests,
    max_boost_amount, used_boost_amount, access_features, special_perks
  ) VALUES (
    v_pass_id, p_user_id::text, p_event_id, 'general'::pass_type, 'active',
    'BSL-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
    ARRAY['general_sessions'], ARRAY['basic_swag']
  )
  RETURNING id::text INTO v_pass_id;

  RETURN v_pass_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_upcoming_bsl_general_pass_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
