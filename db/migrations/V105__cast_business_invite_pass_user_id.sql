-- Production tenant schemas store passes.user_id as text while the protected
-- approval RPC receives an auth UUID. V102's direct comparisons prevented an
-- approved request from upgrading its existing entitlement. Recreate only the
-- helper with an explicit UUID-to-text boundary for every pass lookup/write.

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_business_invite_event_pass(
  p_user_id uuid,
  p_event_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id text;
  v_pass_id uuid;
  v_return_id text;
  v_pass_number text := 'HP-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_pass_number_type text;
BEGIN
  IF p_user_id IS NULL OR NULLIF(btrim(p_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'Business invitation pass identity is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:business-invite-pass:' || p_user_id::text || ':' || p_event_id, 0)
  );

  SELECT pass.id::text INTO v_existing_id
  FROM public.passes AS pass
  WHERE pass.user_id = p_user_id::text
    AND pass.event_id = p_event_id
    AND pass.status = 'active'
  ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
           pass.created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT data_type INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number';

  v_pass_id := gen_random_uuid();
  BEGIN
    IF v_pass_number_type IN ('text', 'character varying') THEN
      EXECUTE '
        INSERT INTO public.passes (
          id, user_id, event_id, pass_type, status, pass_number,
          max_meeting_requests, used_meeting_requests, max_boost_amount,
          used_boost_amount, access_features, special_perks
        ) VALUES ($1, $2, $3, ''general''::public.pass_type, ''active'', $4,
          10, 0, 100, 0, $5, $6)
        RETURNING id::text'
      INTO v_return_id
      USING v_pass_id, p_user_id::text, p_event_id, v_pass_number,
        ARRAY['general_sessions'], ARRAY['basic_swag'];
    ELSE
      INSERT INTO public.passes (
        id, user_id, event_id, pass_type, status,
        max_meeting_requests, used_meeting_requests, max_boost_amount,
        used_boost_amount, access_features, special_perks
      ) VALUES (
        v_pass_id, p_user_id::text, p_event_id, 'general'::public.pass_type, 'active',
        10, 0, 100, 0, ARRAY['general_sessions'], ARRAY['basic_swag']
      )
      RETURNING id::text INTO v_return_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT pass.id::text INTO v_return_id
    FROM public.passes AS pass
    WHERE pass.user_id = p_user_id::text
      AND pass.event_id = p_event_id
      AND pass.status = 'active'
    ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
             pass.created_at DESC
    LIMIT 1;
  END;

  IF v_return_id IS NULL THEN
    RAISE EXCEPTION 'Unable to provision the Business invitation event pass' USING ERRCODE = '22023';
  END IF;
  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_business_invite_event_pass(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_business_invite_event_pass(uuid, text)
  TO service_role;

COMMIT;
