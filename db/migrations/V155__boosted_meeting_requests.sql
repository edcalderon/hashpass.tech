-- Meeting request rules: two meeting types, a 5-minute baseline and boosted length.
--
--   speed   Quick stand-up (the default). Starts at 5 minutes; every 10 boost points
--           add 5 more, up to 30 minutes at 50 points.
--   coffee  Coffee break. 15, 30 or 45 minutes, chosen by the requester; boost only
--           raises queue priority. Requires an active business or VIP pass.
--
-- Queue priority is priority_score = 50 + boost points. Duration, type and priority
-- are all derived here, never trusted from the client; the coffee gate is enforced
-- server-side (SQLSTATE HP403) so a modified client cannot skip it. Legacy free-text
-- meeting types (networking, business, ...) normalise to speed.

BEGIN;

-- The supported duration range is now 5..45 (coffee breaks reach 45).
ALTER TABLE public.meeting_requests
  DROP CONSTRAINT IF EXISTS meeting_requests_duration_minutes_supported_range;
ALTER TABLE public.meeting_requests
  ADD CONSTRAINT meeting_requests_duration_minutes_supported_range
  CHECK (duration_minutes >= 5 AND duration_minutes <= 45) NOT VALID;

-- Single source of truth for how long a request lasts.
CREATE OR REPLACE FUNCTION public.meeting_request_duration(
  p_meeting_type text,
  p_boost_points integer,
  p_requested_minutes integer DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
  SELECT CASE
    WHEN p_meeting_type = 'coffee' THEN
      -- 15, 30 or 45: snap down to a 15-minute step.
      LEAST(45, GREATEST(15, (COALESCE(p_requested_minutes, 15) / 15) * 15))
    ELSE
      -- 5 baseline, +5 per full 10 boost points, capped at 30.
      LEAST(30, 5 + (GREATEST(COALESCE(p_boost_points, 0), 0) / 10) * 5)
  END;
$$;

GRANT EXECUTE ON FUNCTION public.meeting_request_duration(text, integer, integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.insert_meeting_request(
  p_requester_id text,
  p_speaker_id text,
  p_speaker_name text,
  p_requester_name text,
  p_requester_company text,
  p_requester_title text,
  p_requester_ticket_type text,
  p_meeting_type text,
  p_message text,
  p_note text DEFAULT NULL,
  p_boost_amount numeric DEFAULT 0,
  p_duration_minutes integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  requester_id uuid,
  speaker_id uuid,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_speaker RECORD;
  v_request_id uuid := gen_random_uuid();
  v_consumed_pass_id text;
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_target_speaker_id uuid;
  v_dnd boolean := false;
  v_status text := 'pending';
  v_boost integer := GREATEST(FLOOR(COALESCE(p_boost_amount, 0))::integer, 0);
  v_duration integer;
  v_type text := CASE WHEN lower(trim(COALESCE(p_meeting_type, ''))) = 'coffee' THEN 'coffee' ELSE 'speed' END;
  v_pass_type text;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.id IS NULL THEN
    RAISE EXCEPTION 'Speaker not found';
  END IF;

  IF NOT COALESCE((
    SELECT can_request
    FROM public.can_make_meeting_request(
      p_requester_id, p_speaker_id, COALESCE(p_boost_amount, 0), v_event_id
    )
    LIMIT 1
  ), false) THEN
    RAISE EXCEPTION 'Meeting request not allowed';
  END IF;

  -- Coffee breaks are for business and VIP passes only. The pass is read from the
  -- database, not from the client-supplied ticket type.
  IF v_type = 'coffee' THEN
    SELECT p.pass_type::text INTO v_pass_type
    FROM public.passes p
    WHERE p.user_id::text = p_requester_id
      AND p.event_id = v_event_id
      AND p.status = 'active'
    ORDER BY p.created_at DESC
    LIMIT 1;
    IF v_pass_type IS NULL OR v_pass_type NOT IN ('business', 'vip') THEN
      RAISE EXCEPTION 'Coffee meetings require a business or VIP pass'
        USING ERRCODE = 'HP403';
    END IF;
  END IF;

  -- Boosting is server-authoritative. v_boost (whole, non-negative) is the one value
  -- stored, charged to the pass and ranked, so a fractional or negative client amount
  -- can never be charged differently from what it ranks.
  v_duration := public.meeting_request_duration(v_type, v_boost, p_duration_minutes);

  v_target_speaker_id := COALESCE(v_speaker.user_id, v_speaker.id::uuid);

  -- Do-not-disturb: a claimed, active speaker still receives the request, but
  -- it is archived instead of surfacing (no notification, hidden from their inbox).
  SELECT COALESCE(s.do_not_disturb, false) INTO v_dnd
  FROM public.bsl_speakers s
  WHERE s.id::text = v_speaker.id
  LIMIT 1;
  v_dnd := COALESCE(v_dnd, false)
    AND v_speaker.user_id IS NOT NULL
    AND COALESCE(v_speaker.is_active, false);
  IF v_dnd THEN
    v_status := 'archived';
  END IF;

  INSERT INTO public.meeting_requests (
    id, requester_id, speaker_id, event_id, speaker_name, requester_name,
    requester_company, requester_title, requester_ticket_type, meeting_type,
    message, note, boost_amount, duration_minutes, priority_score, expires_at,
    status, created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id::uuid, v_target_speaker_id, v_event_id,
    p_speaker_name, p_requester_name, p_requester_company, p_requester_title,
    p_requester_ticket_type, v_type,
    COALESCE(p_message, ''), p_note, v_boost,
    v_duration, 50 + v_boost, COALESCE(p_expires_at, now() + interval '3 days'),
    'pending', now(), now()
  );

  -- Bare literals coerce to both the text column (prod) and the enum (dev).
  IF v_status = 'archived' THEN
    UPDATE public.meeting_requests SET status = 'archived' WHERE id = v_request_id;
  END IF;

  WITH active_pass AS (
    SELECT p.id
    FROM public.passes p
    WHERE p.user_id::text = p_requester_id
      AND p.event_id = v_event_id
      AND p.status = 'active'
    ORDER BY p.created_at DESC
    LIMIT 1
  )
  UPDATE public.passes p
  SET
    used_meeting_requests = COALESCE(p.used_meeting_requests, 0) + 1,
    used_boost_amount = COALESCE(p.used_boost_amount, 0) + v_boost,
    updated_at = now()
  FROM active_pass
  WHERE p.id = active_pass.id
    AND COALESCE(p.used_meeting_requests, 0) < COALESCE(p.max_meeting_requests, 0)
    AND COALESCE(p.used_boost_amount, 0) + v_boost
      <= COALESCE(p.max_boost_amount, 0)
  RETURNING p.id::text INTO v_consumed_pass_id;

  IF v_consumed_pass_id IS NULL THEN
    RAISE EXCEPTION 'Meeting request entitlement is no longer available';
  END IF;

  PERFORM public.create_notification(
    p_requester_id::uuid, 'meeting_request', 'Request Sent',
    'Your meeting request to ' || p_speaker_name || ' has been sent.',
    v_request_id, v_speaker.id::text, false, NULL
  );

  -- An unclaimed profile has no auth recipient yet. The claim trigger below
  -- relinks this request to the eventual account before notifications begin.
  IF v_speaker.user_id IS NOT NULL AND NOT v_dnd THEN
    PERFORM public.send_prioritized_notification(
      v_speaker.user_id::text, p_requester_name, p_requester_company,
      p_requester_ticket_type, v_boost, v_request_id
    );
  END IF;

  RETURN QUERY
  SELECT v_request_id, p_requester_id::uuid, v_target_speaker_id, v_status, now();
END;
$$;

REVOKE ALL ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) TO authenticated, service_role;

COMMIT;
