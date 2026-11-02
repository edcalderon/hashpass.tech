-- Cast the optional text status before coalescing with the pass_status enum.
-- Without the cast, PostgreSQL raises 42804 on every admin pass update,
-- including ticket-claim upgrades where p_status is NULL.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_mutate_event_pass(
  p_actor_user_id uuid,
  p_event_id text,
  p_action text,
  p_user_id uuid DEFAULT NULL,
  p_pass_id text DEFAULT NULL,
  p_pass_type text DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass_id text;
  v_current_event text;
  v_tier public.event_pass_tiers%ROWTYPE;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create' THEN
    IF p_user_id IS NULL OR p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'A user and valid pass type are required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_tier FROM public.event_pass_tiers
    WHERE event_id = p_event_id AND pass_type = p_pass_type;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.passes (
      id, user_id, event_id, pass_type, status, pass_number,
      max_meeting_requests, used_meeting_requests, max_boost_amount, used_boost_amount,
      access_features, special_perks
    ) VALUES (
      gen_random_uuid()::text, p_user_id::text, p_event_id, p_pass_type::public.pass_type,
      'active', 'ADMIN-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
      CASE WHEN p_pass_type = 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
           WHEN p_pass_type = 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
           ELSE ARRAY['general_sessions'] END,
      CASE WHEN p_pass_type = 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
           WHEN p_pass_type = 'business' THEN ARRAY['business_lounge', 'networking_tools']
           ELSE ARRAY['basic_swag'] END
    ) RETURNING id::text INTO v_pass_id;
  ELSIF p_action = 'update' THEN
    IF p_pass_id IS NULL OR (p_pass_type IS NULL AND p_status IS NULL) THEN
      RAISE EXCEPTION 'A pass and at least one change are required' USING ERRCODE = '22023';
    END IF;
    IF p_pass_type IS NOT NULL AND p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'Invalid pass type' USING ERRCODE = '22023';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'used', 'expired', 'cancelled', 'suspended') THEN
      RAISE EXCEPTION 'Invalid pass status' USING ERRCODE = '22023';
    END IF;
    SELECT event_id INTO v_current_event FROM public.passes WHERE id::text = p_pass_id FOR UPDATE;
    IF v_current_event IS DISTINCT FROM p_event_id THEN
      RAISE EXCEPTION 'Pass does not belong to the requested event' USING ERRCODE = '42501';
    END IF;
    IF p_pass_type IS NOT NULL THEN
      SELECT * INTO v_tier FROM public.event_pass_tiers
      WHERE event_id = p_event_id AND pass_type = p_pass_type;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.passes SET
      pass_type = COALESCE(p_pass_type::public.pass_type, pass_type),
      status = COALESCE(p_status::public.pass_status, status),
      max_meeting_requests = CASE WHEN p_pass_type IS NOT NULL THEN v_tier.max_meeting_requests ELSE max_meeting_requests END,
      max_boost_amount = CASE WHEN p_pass_type IS NOT NULL THEN v_tier.max_boost_amount ELSE max_boost_amount END,
      access_features = CASE WHEN p_pass_type IS NULL THEN access_features
        WHEN p_pass_type = 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
        WHEN p_pass_type = 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
        ELSE ARRAY['general_sessions'] END,
      special_perks = CASE WHEN p_pass_type IS NULL THEN special_perks
        WHEN p_pass_type = 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
        WHEN p_pass_type = 'business' THEN ARRAY['business_lounge', 'networking_tools']
        ELSE ARRAY['basic_swag'] END,
      updated_at = now()
    WHERE id::text = p_pass_id
    RETURNING id::text INTO v_pass_id;
  ELSE
    RAISE EXCEPTION 'Unsupported pass action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (p_actor_user_id, p_event_id, 'pass.' || p_action, 'pass', v_pass_id,
    jsonb_strip_nulls(jsonb_build_object('user_id', p_user_id, 'pass_type', p_pass_type, 'status', p_status)));
  RETURN jsonb_build_object('id', v_pass_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mutate_event_pass(uuid, text, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mutate_event_pass(uuid, text, text, uuid, text, text, text)
  TO service_role;

COMMIT;
