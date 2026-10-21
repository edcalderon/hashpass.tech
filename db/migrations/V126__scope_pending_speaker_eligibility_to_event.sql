-- ============================================================================
-- V126: Scope pending-speaker eligibility to the requested event
-- ============================================================================
-- V123 marked any unclaimed, directory-visible speaker as bookable without
-- comparing the speaker's event_id to the event of the caller's pass. A
-- tampered request pairing an event-A pass with an event-B speaker id was
-- therefore reported "allowed" and the request was stored under event A. The
-- pending shortcut now also requires the speaker to belong to v_event_id;
-- a speaker from another event falls through to the claimed-speaker checks
-- (inactive / not accepting) and is rejected as speaker_not_found.

BEGIN;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'));
  v_speaker RECORD;
  v_pass RECORD;
  v_existing_request RECORD;
  v_blocked boolean := false;
  v_pending boolean := false;
  v_directory_visible boolean := false;
  v_speaker_event_id text;
  v_remaining_requests integer := 0;
  v_remaining_boost numeric := 0;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.id IS NULL THEN
    RETURN QUERY SELECT false, 'speaker_not_found', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  -- get_speaker_by_id_or_slug predates directory_visible; read the flag from
  -- the base row (absent on legacy shapes, which then simply stay claimed-only).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bsl_speakers'
      AND column_name = 'directory_visible'
  ) THEN
    EXECUTE 'SELECT COALESCE(directory_visible, false) FROM public.bsl_speakers WHERE id::text = $1 LIMIT 1'
      INTO v_directory_visible USING v_speaker.id;
  END IF;

  -- The speaker must belong to the event the caller's pass is for.
  SELECT bs.event_id::text INTO v_speaker_event_id
  FROM public.bsl_speakers bs
  WHERE bs.id::text = v_speaker.id::text
  LIMIT 1;

  IF v_speaker_event_id IS NOT NULL AND v_speaker_event_id <> v_event_id THEN
    RETURN QUERY SELECT false, 'speaker_not_found', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  v_pending := v_speaker.user_id IS NULL AND COALESCE(v_directory_visible, false);

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

  IF NOT v_pending AND NOT COALESCE(v_speaker.is_active, false) THEN
    RETURN QUERY SELECT false, 'speaker_inactive', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT v_pending AND NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN QUERY SELECT false, 'not_accepting_meetings', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  v_remaining_requests := GREATEST(
    0,
    COALESCE(v_pass.max_meeting_requests, 0) - COALESCE(v_pass.used_meeting_requests, 0)
  );
  v_remaining_boost := GREATEST(
    0,
    COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)
  );

  SELECT * INTO v_existing_request
  FROM public.meeting_requests mr
  WHERE mr.requester_id::text = p_user_id
    AND mr.event_id = v_event_id
    AND mr.status::text IN ('pending', 'requested', 'approved', 'accepted')
    AND (
      mr.speaker_id::text = v_speaker.id::text
      OR (v_speaker.user_id IS NOT NULL AND mr.speaker_id::text = v_speaker.user_id::text)
    )
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'existing_request', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_blocks'
      AND column_name = 'blocker_user_id'
  ) THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (
        ub.blocked_user_id = $1::uuid
        AND (ub.speaker_id::text = $2 OR ub.blocker_user_id = $3::uuid)
      ) OR (
        ub.blocker_user_id = $1::uuid
        AND $3 IS NOT NULL
        AND ub.blocked_user_id = $3::uuid
      )
    )'
    INTO v_blocked
    USING p_user_id, v_speaker.id::text, v_speaker.user_id::text;
  ELSIF v_speaker.user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocked_id = p_user_id::uuid AND ub.blocker_id = v_speaker.user_id)
         OR (ub.blocker_id = p_user_id::uuid AND ub.blocked_id = v_speaker.user_id)
    ) INTO v_blocked;
  END IF;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF v_remaining_requests <= 0 THEN
    RETURN QUERY SELECT false, 'no_requests_remaining', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF COALESCE(p_boost_amount, 0) > v_remaining_boost THEN
    RETURN QUERY SELECT false, 'insufficient_boost', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
END;
$$;

REVOKE ALL ON FUNCTION public.can_make_meeting_request(text, text, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_make_meeting_request(text, text, numeric, text)
  TO authenticated, service_role;

COMMIT;
