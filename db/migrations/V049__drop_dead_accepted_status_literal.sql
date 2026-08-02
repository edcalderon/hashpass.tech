-- meetings.status is a real Postgres enum (meeting_status) on prod --
-- confirmed live: 'scheduled','confirmed','tentative','in_progress',
-- 'completed','cancelled','no_show'. 'accepted' has never been a member.
-- Every `m.status IN (...)` overlap check compared the enum column
-- against a literal list containing 'accepted', which fails to even
-- parse on an enum-typed column (Postgres must resolve every literal in
-- an IN-list against the column's type up front) -- a hard error on
-- every call, not a silently-ignored no-op. dev's meetings.status is
-- plain text (CHECK constraint, not an enum) so this never surfaced
-- there. 'accepted' is also dead here regardless of column type: nothing
-- in this codebase ever assigns 'accepted' to meetings.status (only
-- 'confirmed'/'tentative' are ever written) -- it appears to be copied
-- from meeting_requests.status's convention, a different enum
-- (meeting_request_status) where 'accepted' is a real, valid member and
-- IS correctly assigned elsewhere in this same function (that assignment
-- is untouched here). Simply drop the dead literal from meetings.status
-- comparisons.

CREATE OR REPLACE FUNCTION public.get_speaker_available_slots(
  p_speaker_id text,
  p_date date DEFAULT NULL,
  p_duration_minutes integer DEFAULT 15,
  p_requester_id text DEFAULT NULL,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  slot_time timestamptz,
  date date,
  start_time time,
  end_time time,
  duration_minutes integer,
  is_available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_requester_uuid uuid;
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
  v_event_timezone text;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT e.starts_at, e.ends_at, COALESCE(e.timezone, 'UTC')
  INTO v_event_starts_at, v_event_ends_at, v_event_timezone
  FROM public.events e
  WHERE e.id = v_event_id;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL
     OR NOT COALESCE(v_speaker.is_active, false)
     OR NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN;
  END IF;

  IF p_requester_id IS NOT NULL THEN
    BEGIN
      v_requester_uuid := p_requester_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_requester_uuid := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH day_bounds AS (
    SELECT generate_series(
      date_trunc('day', v_event_starts_at AT TIME ZONE v_event_timezone),
      date_trunc('day', v_event_ends_at AT TIME ZONE v_event_timezone),
      interval '1 day'
    ) AS day_local
    WHERE v_event_starts_at IS NOT NULL AND v_event_ends_at IS NOT NULL
  ),
  generated_slots AS (
    SELECT
      ((db.day_local + make_interval(hours => wh_hour.hour, mins => wh_minute.minute))
        AT TIME ZONE v_event_timezone) AS slot_time
    FROM day_bounds db
    CROSS JOIN generate_series(7, 18) AS wh_hour(hour)
    CROSS JOIN (VALUES (0), (15), (30), (45)) AS wh_minute(minute)
  ),
  default_free_candidates AS (
    SELECT
      gs.slot_time,
      gs.slot_time::date AS date,
      gs.slot_time::time AS start_time,
      (gs.slot_time + (p_duration_minutes || ' minutes')::interval)::time AS end_time
    FROM generated_slots gs
    WHERE gs.slot_time >= GREATEST(now(), v_event_starts_at)
      AND gs.slot_time < v_event_ends_at
      AND (p_date IS NULL OR gs.slot_time::date = p_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.meeting_slots ms
        WHERE ms.user_id = v_speaker.user_id
          AND ms.start_time = gs.slot_time
          AND ms.status <> 'available'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_agenda_status uas
        WHERE uas.user_id = v_speaker.user_id
          AND uas.event_id = v_event_id
          AND uas.slot_time = gs.slot_time
          AND NOT (
            uas.agenda_id IS NULL
            AND uas.meeting_id IS NULL
            AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
          )
      )
  ),
  legacy_explicit_candidates AS (
    -- Only reachable for tenants with no configured event window, where
    -- day_bounds/generated_slots/default_free_candidates are empty above.
    SELECT
      ms.start_time AS slot_time,
      ms.start_time::date AS date,
      ms.start_time::time AS start_time,
      ms.end_time::time AS end_time
    FROM public.meeting_slots ms
    WHERE v_event_starts_at IS NULL
      AND ms.user_id = v_speaker.user_id
      AND ms.status = 'available'
      AND (p_date IS NULL OR ms.start_time::date = p_date)
      AND ms.start_time >= now()

    UNION

    SELECT
      uas.slot_time,
      uas.slot_time::date AS date,
      uas.slot_time::time AS start_time,
      (uas.slot_time + (p_duration_minutes || ' minutes')::interval)::time AS end_time
    FROM public.user_agenda_status uas
    WHERE v_event_starts_at IS NULL
      AND uas.user_id = v_speaker.user_id
      AND uas.event_id = v_event_id
      AND uas.slot_time IS NOT NULL
      AND uas.slot_status IN ('available', 'interested')
      AND (p_date IS NULL OR uas.slot_time::date = p_date)
      AND uas.slot_time >= now()
  ),
  candidate_slots AS (
    SELECT * FROM default_free_candidates
    UNION
    SELECT * FROM legacy_explicit_candidates
  )
  SELECT
    c.slot_time,
    c.date,
    c.start_time,
    c.end_time,
    p_duration_minutes,
    true
  FROM candidate_slots c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE (
      m.speaker_id::text = v_speaker.id
      OR m.host_id = v_speaker.user_id
      OR m.requester_id = v_speaker.user_id
    )
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND (
        (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
        OR (c.slot_time <= m.scheduled_at
          AND (c.slot_time + (p_duration_minutes || ' minutes')::interval) > m.scheduled_at)
      )
  )
  AND (
    v_requester_uuid IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE m.requester_id = v_requester_uuid
        AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
        AND (
          (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
          OR (c.slot_time <= m.scheduled_at
            AND (c.slot_time + (p_duration_minutes || ' minutes')::interval) > m.scheduled_at)
        )
    )
  )
  ORDER BY c.slot_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_speaker_available_slots(text, date, integer, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_meeting_request(
  p_request_id text,
  p_speaker_id text,
  p_slot_start_time timestamptz,
  p_speaker_response text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
  v_meeting_id uuid := gen_random_uuid();
  v_end_time timestamptz;
  v_duration integer;
  v_slot_id uuid;
  v_requester_conflict boolean := false;
  v_meeting_status text := 'confirmed';
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_speaker.user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_authorized');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.status IN ('pending', 'requested')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  IF v_request.expires_at IS NOT NULL AND v_request.expires_at < now() THEN
    UPDATE public.meeting_requests
    SET status = 'expired', updated_at = now()
    WHERE id = p_request_id::uuid;
    RETURN jsonb_build_object('success', false, 'error', 'request_expired');
  END IF;

  v_duration := COALESCE(v_request.duration_minutes, 15);
  v_end_time := p_slot_start_time + (v_duration || ' minutes')::interval;

  IF p_slot_start_time IS NULL OR p_slot_start_time < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_slot_time');
  END IF;

  -- Take locks in a stable order so two stale slot pickers cannot both book.
  IF v_speaker.user_id::text < v_request.requester_id::text THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_speaker.user_id::text));
    PERFORM pg_advisory_xact_lock(hashtext(v_request.requester_id::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext(v_request.requester_id::text));
    PERFORM pg_advisory_xact_lock(hashtext(v_speaker.user_id::text));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.meeting_slots ms
    WHERE ms.user_id = v_speaker.user_id
      AND ms.status = 'booked'
      AND ms.start_time < v_end_time
      AND ms.end_time > p_slot_start_time
  ) OR EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE (m.speaker_id::text = v_speaker.id OR m.host_id = v_speaker.user_id)
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_slot_conflict');
  END IF;

  -- Speaker-side agenda collision stays a hard fail: the speaker is live in
  -- this flow and should just pick a different slot.
  IF EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_speaker.user_id
      AND uas.slot_time = p_slot_start_time
      AND NOT (
        uas.agenda_id IS NULL
        AND uas.meeting_id IS NULL
        AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'agenda_slot_conflict');
  END IF;

  -- Was a hard fail for both checks below; now soft. The requester's real
  -- existing booking (meetings table or their own agenda) is left
  -- untouched, but acceptance still proceeds and produces a 'tentative'
  -- meeting the requester must explicitly resolve.
  v_requester_conflict := EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.requester_id = v_request.requester_id
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) OR EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_request.requester_id
      AND uas.slot_time = p_slot_start_time
      AND NOT (
        uas.agenda_id IS NULL
        AND uas.meeting_id IS NULL
        AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
      )
  );
  IF v_requester_conflict THEN
    v_meeting_status := 'tentative';
  END IF;

  INSERT INTO public.meeting_slots (user_id, start_time, end_time, status, meeting_id)
  VALUES (v_speaker.user_id, p_slot_start_time, v_end_time, 'booked', v_meeting_id)
  ON CONFLICT (user_id, start_time) DO UPDATE SET
    end_time = EXCLUDED.end_time,
    status = 'booked',
    meeting_id = v_meeting_id,
    updated_at = now()
  WHERE public.meeting_slots.status = 'available'
    AND public.meeting_slots.meeting_id IS NULL
  RETURNING id INTO v_slot_id;

  IF v_slot_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_slot_unavailable');
  END IF;

  INSERT INTO public.meetings (
    id, meeting_request_id, event_id, slot_id, speaker_id, requester_id,
    host_id, attendee_id, speaker_name, requester_name, meeting_type, status,
    scheduled_at, start_time, end_time, duration_minutes, location, meeting_link,
    notes, title, description, created_at, updated_at
  ) VALUES (
    v_meeting_id, v_request.id, v_request.event_id, v_slot_id, v_speaker.id,
    v_request.requester_id, v_speaker.user_id, v_request.requester_id,
    COALESCE(v_request.speaker_name, v_speaker.name), v_request.requester_name,
    COALESCE(v_request.meeting_type, 'networking'), v_meeting_status,
    p_slot_start_time, p_slot_start_time, v_end_time, v_duration,
    v_request.meeting_location, v_request.meeting_link,
    COALESCE(p_speaker_response, 'Meeting scheduled'), v_request.speaker_name,
    v_request.message, now(), now()
  );

  UPDATE public.meeting_requests
  SET status = 'accepted', meeting_id = v_meeting_id,
      meeting_scheduled_at = p_slot_start_time, scheduled_at = p_slot_start_time,
      speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
      speaker_response_at = now(), updated_at = now()
  WHERE id = v_request.id;

  -- Agenda rows are written the same way regardless of v_meeting_status: a
  -- tentative meeting must still occupy the slot and block further double
  -- booking while unresolved (the overlap checks above already treat
  -- 'tentative' the same as 'confirmed' for that purpose). slot_status is
  -- intentionally left alone here -- its CHECK constraint doesn't include
  -- 'confirmed', and meeting_id being set is what the agenda-conflict
  -- check above actually relies on, not slot_status.
  UPDATE public.user_agenda_status
  SET status = 'confirmed', confirmed_at = now(),
      meeting_id = v_meeting_id, updated_at = now()
  WHERE user_id = v_speaker.user_id
    AND event_id = v_request.event_id
    AND slot_time = p_slot_start_time;
  IF NOT FOUND THEN
    INSERT INTO public.user_agenda_status (
      user_id, agenda_id, event_id, status, confirmed_at, slot_time,
      meeting_id, created_at, updated_at
    ) VALUES (
      v_speaker.user_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
      p_slot_start_time, v_meeting_id, now(), now()
    );
  END IF;

  UPDATE public.user_agenda_status
  SET status = 'confirmed', confirmed_at = now(),
      meeting_id = v_meeting_id, updated_at = now()
  WHERE user_id = v_request.requester_id
    AND event_id = v_request.event_id
    AND slot_time = p_slot_start_time;
  IF NOT FOUND THEN
    INSERT INTO public.user_agenda_status (
      user_id, agenda_id, event_id, status, confirmed_at, slot_time,
      meeting_id, created_at, updated_at
    ) VALUES (
      v_request.requester_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
      p_slot_start_time, v_meeting_id, now(), now()
    );
  END IF;

  IF v_meeting_status = 'tentative' THEN
    PERFORM public.create_notification(
      v_request.requester_id, 'meeting_slot_conflict', 'Scheduling Conflict - Action Needed',
      COALESCE(v_request.speaker_name, v_speaker.name) || ' accepted your meeting request, but it overlaps with another meeting on your calendar. Open it to choose which one to keep.',
      v_request.id, v_speaker.id::text, true, v_meeting_id
    );
  ELSE
    PERFORM public.create_notification(
      v_request.requester_id, 'meeting_accepted', 'Meeting Request Accepted',
      COALESCE(v_request.speaker_name, v_speaker.name) || ' accepted your meeting request.',
      v_request.id, v_speaker.id::text, false, v_meeting_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'meeting_id', v_meeting_id, 'slot_id', v_slot_id,
    'start_time', p_slot_start_time, 'end_time', v_end_time, 'status', v_meeting_status,
    'requires_resolution', v_requester_conflict
  );
END;
$$;
