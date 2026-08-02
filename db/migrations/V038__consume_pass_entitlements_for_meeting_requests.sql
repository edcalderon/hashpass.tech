-- A meeting-request entitlement is consumed when the request is sent.  It is
-- never restored when the request is declined, cancelled, or expires.  Keep
-- the active pass row as the single source of truth for both eligibility and
-- wallet display, and update it in the same transaction as request creation.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_meeting_request_counts(
  p_user_id text,
  p_event_id text
)
RETURNS TABLE (
  total_requests bigint,
  accepted_requests bigint,
  approved_requests bigint,
  pending_requests bigint,
  declined_requests bigint,
  cancelled_requests bigint,
  remaining_requests integer,
  remaining_boost numeric,
  max_requests integer,
  max_boost numeric,
  pass_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_pass RECORD;
  v_accepted bigint := 0;
  v_approved bigint := 0;
  v_pending bigint := 0;
  v_declined bigint := 0;
  v_cancelled bigint := 0;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.max_boost_amount,
    p.used_meeting_requests,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('pending', 'requested'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint
  INTO v_accepted, v_approved, v_pending, v_declined, v_cancelled
  FROM public.meeting_requests
  WHERE requester_id::text = p_user_id
    AND event_id = v_event_id;

  RETURN QUERY
  SELECT
    COALESCE(v_pass.used_meeting_requests, 0)::bigint,
    v_accepted,
    v_approved,
    v_pending,
    v_declined,
    v_cancelled,
    GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - COALESCE(v_pass.used_meeting_requests, 0)),
    GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)),
    COALESCE(v_pass.max_meeting_requests, 0),
    COALESCE(v_pass.max_boost_amount, 0),
    COALESCE(v_pass.pass_type, 'general');
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
SET search_path = public, pg_temp
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
      AND (ub.speaker_id::text = v_speaker.id OR ub.blocker_user_id = v_speaker.user_id)
    ) OR (
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

  IF COALESCE(p_boost_amount, 0) > v_remaining_boost THEN
    RETURN QUERY SELECT false, 'insufficient_boost', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
END;
$$;

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
  p_duration_minutes integer DEFAULT 15,
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
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
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

  INSERT INTO public.meeting_requests (
    id, requester_id, speaker_id, event_id, speaker_name, requester_name,
    requester_company, requester_title, requester_ticket_type, meeting_type,
    message, note, boost_amount, duration_minutes, expires_at, status,
    created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id::uuid, v_speaker.user_id, v_event_id,
    p_speaker_name, p_requester_name, p_requester_company, p_requester_title,
    p_requester_ticket_type, COALESCE(NULLIF(p_meeting_type, ''), 'networking'),
    COALESCE(p_message, ''), p_note, COALESCE(p_boost_amount, 0),
    COALESCE(p_duration_minutes, 15), COALESCE(p_expires_at, now() + interval '3 days'),
    'pending', now(), now()
  );

  -- The conditional update serializes concurrent sends and ensures this exact
  -- event's newest active pass is consumed once for each persisted request.
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
    used_boost_amount = COALESCE(p.used_boost_amount, 0) + GREATEST(COALESCE(p_boost_amount, 0), 0),
    updated_at = now()
  FROM active_pass
  WHERE p.id = active_pass.id
    AND COALESCE(p.used_meeting_requests, 0) < COALESCE(p.max_meeting_requests, 0)
    AND COALESCE(p.used_boost_amount, 0) + GREATEST(COALESCE(p_boost_amount, 0), 0)
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

  PERFORM public.send_prioritized_notification(
    v_speaker.id::text, p_requester_name, p_requester_company,
    p_requester_ticket_type, COALESCE(p_boost_amount, 0), v_request_id
  );

  RETURN QUERY
  SELECT v_request_id, p_requester_id::uuid, v_speaker.user_id, 'pending', now();
END;
$$;

-- Repair existing passes without decreasing any previously recorded usage.
-- Historical cancelled and rejected requests count because they were sent.
WITH latest_active_pass AS (
  SELECT DISTINCT ON (p.user_id::text, p.event_id)
    p.id,
    p.user_id::text AS user_id,
    p.event_id
  FROM public.passes p
  WHERE p.status = 'active'
  ORDER BY p.user_id::text, p.event_id, p.created_at DESC
), historical_usage AS (
  SELECT
    ap.id,
    COUNT(mr.id)::integer AS request_count,
    COALESCE(SUM(GREATEST(COALESCE(mr.boost_amount, 0), 0)), 0) AS boost_amount
  FROM latest_active_pass ap
  LEFT JOIN public.meeting_requests mr
    ON mr.requester_id::text = ap.user_id
    AND mr.event_id = ap.event_id
  GROUP BY ap.id
)
UPDATE public.passes p
SET
  used_meeting_requests = GREATEST(
    COALESCE(p.used_meeting_requests, 0),
    LEAST(COALESCE(p.max_meeting_requests, 0), historical_usage.request_count)
  ),
  used_boost_amount = GREATEST(
    COALESCE(p.used_boost_amount, 0),
    LEAST(COALESCE(p.max_boost_amount, 0), historical_usage.boost_amount)
  ),
  updated_at = now()
FROM historical_usage
WHERE p.id = historical_usage.id;

REVOKE ALL ON FUNCTION public.get_user_meeting_request_counts(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_make_meeting_request(text, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_meeting_request_counts(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_make_meeting_request(text, text, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) TO authenticated, service_role;

COMMIT;
