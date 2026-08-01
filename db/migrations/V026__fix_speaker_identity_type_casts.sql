-- Speaker IDs are UUIDs in the production catalog but enter public RPCs as
-- text. Normalize these comparisons before meeting eligibility is evaluated.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_speaker_by_id_or_slug(p_id text)
RETURNS TABLE (
  id text,
  name text,
  title text,
  company text,
  bio text,
  imageurl text,
  linkedin text,
  twitter text,
  tags text[],
  availability jsonb,
  user_id uuid,
  is_active boolean,
  is_accepting_meetings boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id::text,
    s.name,
    s.title,
    s.company,
    s.bio,
    s.imageurl,
    s.linkedin,
    s.twitter,
    s.tags,
    s.availability,
    s.user_id,
    s.is_active,
    s.is_accepting_meetings,
    s.created_at,
    s.updated_at
  FROM public.bsl_speakers s
  WHERE s.id::text = p_id
     OR lower(s.name) = lower(p_id)
     OR s.user_id::text = p_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_make_meeting_request(
  p_user_id text,
  p_speaker_id text,
  p_boost_amount numeric DEFAULT 0,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  can_request boolean,
  reason text,
  pass_type text,
  remaining_requests integer,
  remaining_boost numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'));
  v_speaker RECORD;
  v_pass RECORD;
  v_existing_request RECORD;
  v_blocked boolean := false;
  v_remaining_requests integer := 0;
  v_remaining_boost numeric := 0;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN QUERY SELECT false, 'speaker_not_found', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.used_meeting_requests,
    p.max_boost_amount,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pass.id IS NULL THEN
    RETURN QUERY SELECT false, 'no_valid_pass', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_active, false) THEN
    RETURN QUERY SELECT false, 'speaker_inactive', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN QUERY SELECT false, 'not_accepting_meetings', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  v_remaining_requests := GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - (
    SELECT COUNT(*)
    FROM public.meeting_requests mr
    WHERE mr.requester_id::text = p_user_id
      AND mr.event_id = v_event_id
      AND mr.status NOT IN ('cancelled', 'expired')
  ));
  v_remaining_boost := GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0));

  SELECT * INTO v_existing_request
  FROM public.meeting_requests mr
  WHERE mr.requester_id::text = p_user_id
    AND mr.speaker_id::text = v_speaker.user_id::text
    AND mr.event_id = v_event_id
    AND mr.status IN ('pending', 'requested', 'approved', 'accepted')
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'existing_request', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks ub
    WHERE (
      ub.blocked_user_id = p_user_id::uuid
      AND (
        ub.speaker_id::text = v_speaker.id
        OR ub.blocker_user_id = v_speaker.user_id
      )
    )
    OR (
      ub.blocker_user_id = p_user_id::uuid
      AND ub.blocked_user_id = v_speaker.user_id
    )
  ) INTO v_blocked;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF v_remaining_requests <= 0 THEN
    RETURN QUERY SELECT false, 'no_requests_remaining', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF p_boost_amount > v_remaining_boost THEN
    RETURN QUERY SELECT false, 'insufficient_boost', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_speaker_by_id_or_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_make_meeting_request(text, text, numeric, text) TO authenticated;

COMMIT;
