-- ============================================================================
-- V121: Fix the reset RPC's pass_request_limits column scope
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.reset_meeting_request_limits(
  p_user_id text,
  p_event_id text,
  p_boost_cost numeric DEFAULT 50
)
RETURNS TABLE (
  pass_id text,
  event_id text,
  reset_cost numeric,
  remaining_requests integer,
  remaining_boost numeric,
  pass_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_user_id text := NULLIF(trim(COALESCE(p_user_id, '')), '');
  v_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_pass RECORD;
  v_updated_pass_id text;
  v_remaining_requests integer;
  v_remaining_boost numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'A valid user id is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required' USING ERRCODE = '22023';
  END IF;
  IF p_boost_cost IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'The meeting-request reset costs exactly 50 Boost points'
      USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'service_role'
     AND auth.uid() IS NOT NULL
     AND auth.uid()::text <> v_user_id THEN
    RAISE EXCEPTION 'You may only reset your own meeting request limits'
      USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'service_role'
     AND auth.uid() IS NULL
     AND public.get_current_user_id()::text IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'An authenticated user is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    p.id,
    p.max_meeting_requests,
    p.used_meeting_requests,
    p.max_boost_amount,
    p.used_boost_amount,
    p.pass_type::text AS pass_type
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = v_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'No active pass found for this event' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_pass.used_meeting_requests, 0)
       < COALESCE(v_pass.max_meeting_requests, 0) THEN
    RAISE EXCEPTION 'The meeting request limit has not been reached'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_pass.max_boost_amount, 0)
       - COALESCE(v_pass.used_boost_amount, 0) < p_boost_cost THEN
    RAISE EXCEPTION 'Not enough Boost points remain for this reset'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.passes p
  SET used_meeting_requests = 0,
      used_boost_amount = COALESCE(p.used_boost_amount, 0) + p_boost_cost,
      updated_at = now()
  WHERE p.id = v_pass.id
  RETURNING p.id::text,
            GREATEST(0, COALESCE(p.max_meeting_requests, 0) - COALESCE(p.used_meeting_requests, 0)),
            GREATEST(0, COALESCE(p.max_boost_amount, 0) - COALESCE(p.used_boost_amount, 0))
  INTO v_updated_pass_id, v_remaining_requests, v_remaining_boost;

  UPDATE public.pass_request_limits AS prl
  SET requests_used = 0,
      reset_at = now(),
      updated_at = now()
  WHERE prl.pass_id = v_pass.id
    AND prl.user_id = v_user_id;

  RETURN QUERY
  SELECT v_updated_pass_id,
         v_event_id,
         p_boost_cost,
         v_remaining_requests,
         v_remaining_boost,
         v_pass.pass_type;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_meeting_request_limits(text, text, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_meeting_request_limits(text, text, numeric)
  TO authenticated, service_role;

COMMIT;
