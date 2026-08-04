BEGIN;

-- Keep admin_mutate_event_pass unchanged. Usage edits are intentionally exposed
-- through a separate RPC so existing create/tier/status callers keep the
-- original, already-deployed function signature.
CREATE OR REPLACE FUNCTION public.admin_update_event_pass_usage(
  p_actor_user_id uuid,
  p_event_id text,
  p_pass_id text,
  p_max_meeting_requests integer,
  p_used_meeting_requests integer,
  p_max_boost_amount numeric,
  p_used_boost_amount numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_pass_id IS NULL OR p_max_meeting_requests IS NULL
     OR p_used_meeting_requests IS NULL OR p_max_boost_amount IS NULL
     OR p_used_boost_amount IS NULL THEN
    RAISE EXCEPTION 'All usage and limit values are required' USING ERRCODE = '22023';
  END IF;

  IF p_max_meeting_requests < 0 OR p_used_meeting_requests < 0
     OR p_max_boost_amount < 0 OR p_used_boost_amount < 0 THEN
    RAISE EXCEPTION 'Usage values cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_used_meeting_requests > p_max_meeting_requests
     OR p_used_boost_amount > p_max_boost_amount THEN
    RAISE EXCEPTION 'Used values cannot exceed their limits' USING ERRCODE = '22023';
  END IF;

  SELECT event_id INTO v_event_id
  FROM public.passes
  WHERE id::text = p_pass_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Pass not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event_id IS DISTINCT FROM p_event_id THEN
    RAISE EXCEPTION 'Pass does not belong to the requested event' USING ERRCODE = '42501';
  END IF;

  UPDATE public.passes
  SET max_meeting_requests = p_max_meeting_requests,
      used_meeting_requests = p_used_meeting_requests,
      max_boost_amount = p_max_boost_amount,
      used_boost_amount = p_used_boost_amount,
      updated_at = now()
  WHERE id::text = p_pass_id;

  INSERT INTO public.admin_action_log
    (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id, p_event_id, 'pass.usage.update', 'pass', p_pass_id,
    jsonb_build_object(
      'max_meeting_requests', p_max_meeting_requests,
      'used_meeting_requests', p_used_meeting_requests,
      'max_boost_amount', p_max_boost_amount,
      'used_boost_amount', p_used_boost_amount
    )
  );

  RETURN jsonb_build_object(
    'id', p_pass_id,
    'max_meeting_requests', p_max_meeting_requests,
    'used_meeting_requests', p_used_meeting_requests,
    'max_boost_amount', p_max_boost_amount,
    'used_boost_amount', p_used_boost_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_event_pass_usage(uuid, text, text, integer, integer, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_event_pass_usage(uuid, text, text, integer, integer, numeric, numeric)
  TO service_role;

COMMIT;
