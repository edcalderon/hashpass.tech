-- Mutual agenda blocking and 5-minute-aware scheduling.
--
-- When a speaker accepts a request, the full meeting interval is blocked for BOTH
-- people: the speaker and the requester each get a booked meeting_slots row and a
-- meetings row, so nobody else can book either of them for any overlapping time.
-- Every conflict check is interval-based (the old ones compared exact start times),
-- and a person counts as busy whether they are the host or the requester of a meeting.
-- Cancelling or declining a conflict releases both sides. The slot grid follows the
-- meeting length: 5/10-minute stand-ups are offered on a 5/10-minute grid, everything
-- longer on the 15-minute grid.

BEGIN;

-- Block [p_start, p_end) for one user. False when the user already has something
-- overlapping from a different meeting. Internal helper for the functions below.
CREATE OR REPLACE FUNCTION public.block_meeting_interval(
  p_user_id uuid, p_start timestamptz, p_end timestamptz, p_meeting_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.meeting_slots ms
    WHERE ms.user_id = p_user_id
      AND ms.status <> 'available'
      AND ms.meeting_id IS DISTINCT FROM p_meeting_id
      AND ms.start_time < p_end
      AND ms.end_time > p_start
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.meeting_slots (user_id, start_time, end_time, status, meeting_id)
  VALUES (p_user_id, p_start, p_end, 'booked', p_meeting_id)
  ON CONFLICT (user_id, start_time) DO UPDATE SET
    end_time = EXCLUDED.end_time,
    status = 'booked',
    meeting_id = p_meeting_id,
    updated_at = now()
  WHERE public.meeting_slots.status = 'available'
     OR public.meeting_slots.meeting_id = p_meeting_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- Free both sides of a meeting. The host's row returns to the open pool (as before);
-- the requester's row only ever existed to block them, so it is removed.
CREATE OR REPLACE FUNCTION public.release_meeting_interval(p_meeting_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT m.host_id INTO v_host FROM public.meetings m WHERE m.id = p_meeting_id;
  UPDATE public.meeting_slots
  SET status = 'available', meeting_id = NULL, updated_at = now()
  WHERE meeting_id = p_meeting_id AND user_id = v_host;
  DELETE FROM public.meeting_slots WHERE meeting_id = p_meeting_id;
  DELETE FROM public.user_agenda_status WHERE meeting_id = p_meeting_id;
END;
$$;

REVOKE ALL ON FUNCTION public.block_meeting_interval(uuid, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_meeting_interval(uuid)
  FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.accept_meeting_request(p_request_id text, p_speaker_id text, p_slot_start_time timestamp with time zone, p_speaker_response text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
  v_speaker_registry_id uuid;
  v_requester_registry_id uuid;
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

  v_duration := COALESCE(v_request.duration_minutes, 5);
  v_end_time := p_slot_start_time + (v_duration || ' minutes')::interval;

  IF p_slot_start_time IS NULL OR p_slot_start_time < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_slot_time');
  END IF;

  -- user_agenda_status.user_id is a FK into public.user (the registry row),
  -- an independently-generated id -- not the Supabase auth uuid every other
  -- column in this function uses. Resolve both parties' registry ids once,
  -- up front, for every read/write against that table below. A missing
  -- registry row (no bridged Supabase account yet) is not fatal: agenda
  -- rows are a supplementary sync for the schedule screen, not the actual
  -- booking record (meetings/meeting_slots, keyed by auth uuid, already
  -- carry the real conflict-prevention guarantee).
  SELECT id INTO v_speaker_registry_id
  FROM public."user" WHERE auth_user_id = v_speaker.user_id::text LIMIT 1;
  SELECT id INTO v_requester_registry_id
  FROM public."user" WHERE auth_user_id = v_request.requester_id::text LIMIT 1;

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
      AND ms.status <> 'available'
      AND ms.start_time < v_end_time
      AND ms.end_time > p_slot_start_time
  ) OR EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE (m.speaker_id::text = v_speaker.id OR m.host_id = v_speaker.user_id
            OR m.requester_id = v_speaker.user_id OR m.attendee_id = v_speaker.user_id)
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_slot_conflict');
  END IF;

  -- Speaker-side agenda collision stays a hard fail: the speaker is live in
  -- this flow and should just pick a different slot.
  IF v_speaker_registry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_speaker_registry_id
      AND uas.meeting_id IS NULL
      AND uas.slot_time < v_end_time
      AND uas.slot_time + interval '15 minutes' > p_slot_start_time
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
    WHERE (m.requester_id = v_request.requester_id OR m.host_id = v_request.requester_id
            OR m.attendee_id = v_request.requester_id)
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) OR EXISTS (
    SELECT 1 FROM public.meeting_slots ms
    WHERE ms.user_id = v_request.requester_id
      AND ms.status <> 'available'
      AND ms.start_time < v_end_time
      AND ms.end_time > p_slot_start_time
  ) OR (v_requester_registry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_requester_registry_id
      AND uas.meeting_id IS NULL
      AND uas.slot_time < v_end_time
      AND uas.slot_time + interval '15 minutes' > p_slot_start_time
      AND NOT (
        uas.agenda_id IS NULL
        AND uas.meeting_id IS NULL
        AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
      )
  ));
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

  -- Mutual blocking: the requester's agenda is held for the same interval, so nobody
  -- else can book them either. If it cannot be held (a race with another booking
  -- that landed after the checks above) the meeting stays tentative instead.
  IF NOT v_requester_conflict AND NOT public.block_meeting_interval(
    v_request.requester_id, p_slot_start_time, v_end_time, v_meeting_id
  ) THEN
    v_requester_conflict := true;
    v_meeting_status := 'tentative';
  END IF;

  -- meetings.speaker_id is uuid on prod but text on dev (same schema
  -- divergence V048 already found on the read side) -- v_speaker.id is
  -- always a text value (get_speaker_by_id_or_slug casts s.id::text), which
  -- a static VALUES clause parses against ONE fixed column type at CREATE
  -- FUNCTION time and fails on whichever environment's column doesn't match.
  -- EXECUTE + %L lets each environment's real column type parse the literal
  -- itself at runtime, exactly like a hand-typed INSERT would.
  EXECUTE format(
    'INSERT INTO public.meetings (
      id, meeting_request_id, event_id, slot_id, speaker_id, requester_id,
      host_id, attendee_id, speaker_name, requester_name, meeting_type, status,
      scheduled_at, start_time, end_time, duration_minutes, location, meeting_link,
      notes, title, description, created_at, updated_at
    ) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
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
  IF v_speaker_registry_id IS NOT NULL THEN
    UPDATE public.user_agenda_status
    SET status = 'confirmed', confirmed_at = now(),
        meeting_id = v_meeting_id, updated_at = now()
    WHERE user_id = v_speaker_registry_id
      AND event_id = v_request.event_id
      AND slot_time = p_slot_start_time;
    IF NOT FOUND THEN
      INSERT INTO public.user_agenda_status (
        user_id, agenda_id, event_id, status, confirmed_at, slot_time,
        meeting_id, created_at, updated_at
      ) VALUES (
        v_speaker_registry_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
        p_slot_start_time, v_meeting_id, now(), now()
      );
    END IF;
  END IF;

  IF v_requester_registry_id IS NOT NULL THEN
    UPDATE public.user_agenda_status
    SET status = 'confirmed', confirmed_at = now(),
        meeting_id = v_meeting_id, updated_at = now()
    WHERE user_id = v_requester_registry_id
      AND event_id = v_request.event_id
      AND slot_time = p_slot_start_time;
    IF NOT FOUND THEN
      INSERT INTO public.user_agenda_status (
        user_id, agenda_id, event_id, status, confirmed_at, slot_time,
        meeting_id, created_at, updated_at
      ) VALUES (
        v_requester_registry_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
        p_slot_start_time, v_meeting_id, now(), now()
      );
    END IF;
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

CREATE OR REPLACE FUNCTION public.get_speaker_available_slots(p_speaker_id text, p_date date DEFAULT NULL::date, p_duration_minutes integer DEFAULT 15, p_requester_id text DEFAULT NULL::text, p_event_id text DEFAULT NULL::text) RETURNS TABLE(slot_time timestamp with time zone, date date, start_time time without time zone, end_time time without time zone, duration_minutes integer, is_available boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_speaker RECORD;
  v_requester_uuid uuid;
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
  v_event_timezone text;
  v_duration integer := LEAST(45, GREATEST(5, COALESCE(p_duration_minutes, 15)));
  -- 5/10-minute stand-ups are offered on a 5/10-minute grid, longer meetings on 15.
  v_step integer;
BEGIN
  v_step := CASE WHEN v_duration < 15 THEN (v_duration / 5) * 5 ELSE 15 END;
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
    CROSS JOIN generate_series(0, 59, v_step) AS wh_minute(minute)
  ),
  default_free_candidates AS (
    SELECT
      gs.slot_time,
      gs.slot_time::date AS date,
      gs.slot_time::time AS start_time,
      (gs.slot_time + (v_duration || ' minutes')::interval)::time AS end_time
    FROM generated_slots gs
    WHERE gs.slot_time >= GREATEST(now(), v_event_starts_at)
      AND gs.slot_time < v_event_ends_at
      AND (p_date IS NULL OR gs.slot_time::date = p_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.meeting_slots ms
        WHERE ms.user_id = v_speaker.user_id
          AND ms.start_time < gs.slot_time + make_interval(mins => v_duration)
          AND ms.end_time > gs.slot_time
          AND ms.status <> 'available'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_agenda_status uas
        WHERE uas.user_id = v_speaker.user_id
          AND uas.event_id = v_event_id
          AND uas.meeting_id IS NULL
          AND uas.slot_time < gs.slot_time + make_interval(mins => v_duration)
          AND uas.slot_time + interval '15 minutes' > gs.slot_time
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
      (uas.slot_time + (v_duration || ' minutes')::interval)::time AS end_time
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
    v_duration,
    true
  FROM candidate_slots c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE (
      m.speaker_id::text = v_speaker.id
      OR m.host_id = v_speaker.user_id
      OR m.requester_id = v_speaker.user_id
      OR m.attendee_id = v_speaker.user_id
    )
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND (
        (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
        OR (c.slot_time <= m.scheduled_at
          AND (c.slot_time + (v_duration || ' minutes')::interval) > m.scheduled_at)
      )
  )
  AND (
    v_requester_uuid IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE (m.requester_id = v_requester_uuid OR m.host_id = v_requester_uuid
             OR m.attendee_id = v_requester_uuid)
        AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
        AND (
          (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
          OR (c.slot_time <= m.scheduled_at
            AND (c.slot_time + (v_duration || ' minutes')::interval) > m.scheduled_at)
        )
    )
  )
  ORDER BY c.slot_time;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_meeting_request(p_request_id text, p_user_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id::uuid THEN
    RETURN false;
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests
  WHERE id = p_request_id::uuid
    AND requester_id = p_user_id::uuid
    AND status IN ('pending', 'requested', 'accepted')
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.meeting_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = v_request.id;

  IF v_request.meeting_id IS NOT NULL THEN
    UPDATE public.meetings
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_request.meeting_id;
    PERFORM public.release_meeting_interval(v_request.meeting_id);
  END IF;

  PERFORM public.create_notification(
    v_request.speaker_id, 'meeting_cancelled', 'Meeting Request Cancelled',
    COALESCE(v_request.requester_name, 'A user') || ' cancelled their meeting request.',
    v_request.id, NULL, false, v_request.meeting_id
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_meeting_slot_conflict(p_meeting_id uuid, p_user_id uuid, p_action text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_meeting RECORD;
  v_conflict_ids uuid[];
  v_old RECORD;
BEGIN
  IF p_action NOT IN ('replace', 'keep_existing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT * INTO v_meeting
  FROM public.meetings
  WHERE id = p_meeting_id
    AND status = 'tentative'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_pending_resolution');
  END IF;

  IF v_meeting.requester_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT array_agg(m.id) INTO v_conflict_ids
  FROM public.meetings m
  WHERE m.requester_id = p_user_id
    AND m.id <> p_meeting_id
    AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
    AND m.start_time < v_meeting.end_time
    AND m.end_time > v_meeting.start_time;

  -- Race: the old conflict is already gone (cancelled some other way
  -- between notification and resolution). Auto-promote regardless of which
  -- action was requested rather than honoring a literal "keep_existing"
  -- and destroying the requester's only remaining meeting.
  IF v_conflict_ids IS NULL THEN
    UPDATE public.meetings
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_meeting_id;
    PERFORM public.block_meeting_interval(
      v_meeting.requester_id, v_meeting.start_time, v_meeting.end_time, p_meeting_id
    );

    RETURN jsonb_build_object(
      'success', true, 'action', 'already_resolved', 'meeting_id', p_meeting_id,
      'status', 'confirmed', 'cancelled_meeting_ids', '{}'::uuid[]
    );
  END IF;

  IF p_action = 'replace' THEN
    FOR v_old IN
      SELECT id, meeting_request_id, host_id, requester_name
      FROM public.meetings
      WHERE id = ANY(v_conflict_ids)
    LOOP
      UPDATE public.meetings
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_old.id;
      PERFORM public.release_meeting_interval(v_old.id);
      IF v_old.meeting_request_id IS NOT NULL THEN
        UPDATE public.meeting_requests
        SET status = 'cancelled', updated_at = now()
        WHERE id = v_old.meeting_request_id;
      END IF;
      PERFORM public.create_notification(
        v_old.host_id, 'meeting_cancelled', 'Meeting Cancelled',
        COALESCE(v_old.requester_name, 'A user') || ' resolved a scheduling conflict and this meeting has been cancelled.',
        v_old.meeting_request_id, NULL, false, v_old.id
      );
    END LOOP;

    UPDATE public.meetings
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_meeting_id;
    PERFORM public.block_meeting_interval(
      v_meeting.requester_id, v_meeting.start_time, v_meeting.end_time, p_meeting_id
    );

    PERFORM public.create_notification(
      v_meeting.host_id, 'meeting_accepted', 'Meeting Confirmed',
      COALESCE(v_meeting.requester_name, 'A user') || ' resolved a scheduling conflict and confirmed this meeting.',
      v_meeting.meeting_request_id, NULL, false, p_meeting_id
    );

    RETURN jsonb_build_object(
      'success', true, 'action', 'replace', 'meeting_id', p_meeting_id,
      'status', 'confirmed', 'cancelled_meeting_ids', v_conflict_ids
    );
  ELSE
    UPDATE public.meetings
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_meeting_id;
    PERFORM public.release_meeting_interval(p_meeting_id);
    IF v_meeting.meeting_request_id IS NOT NULL THEN
      UPDATE public.meeting_requests
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_meeting.meeting_request_id;
    END IF;

    PERFORM public.create_notification(
      v_meeting.host_id, 'meeting_cancelled', 'Meeting Cancelled',
      COALESCE(v_meeting.requester_name, 'A user') || ' could not confirm this time slot due to a scheduling conflict. It has reopened on your calendar.',
      v_meeting.meeting_request_id, NULL, false, p_meeting_id
    );

    RETURN jsonb_build_object(
      'success', true, 'action', 'keep_existing', 'meeting_id', p_meeting_id,
      'status', 'cancelled', 'cancelled_meeting_ids', '{}'::uuid[]
    );
  END IF;
END;
$$;

COMMIT;
