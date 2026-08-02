-- Event-scope get_speaker_available_slots' meeting_slots arm (previously
-- unbounded by any event date window, unlike the user_agenda_status arm),
-- and turn a requester-side booking conflict at accept time from a hard
-- fail into a soft 'tentative' meeting the requester can resolve, instead
-- of just erroring out with no path forward.

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
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT e.starts_at, e.ends_at INTO v_event_starts_at, v_event_ends_at
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
  WITH candidate_slots AS (
    SELECT
      ms.start_time AS slot_time,
      ms.start_time::date AS date,
      ms.start_time::time AS start_time,
      ms.end_time::time AS end_time
    FROM public.meeting_slots ms
    WHERE ms.user_id = v_speaker.user_id
      AND ms.status = 'available'
      AND (p_date IS NULL OR ms.start_time::date = p_date)
      AND ms.start_time >= now()
      -- meeting_slots has no event_id column, so a globally-marked-free row
      -- must still fall inside the resolved event's own calendar window
      -- when one is configured. Null-tolerant: hub-level events without a
      -- seeded window (bsl, bsl2025) keep the pre-V043 unfiltered behavior.
      AND (v_event_starts_at IS NULL OR ms.start_time >= v_event_starts_at)
      AND (v_event_ends_at IS NULL OR ms.start_time <= v_event_ends_at)

    UNION

    SELECT
      uas.slot_time,
      uas.slot_time::date AS date,
      uas.slot_time::time AS start_time,
      (uas.slot_time + (p_duration_minutes || ' minutes')::interval)::time AS end_time
    FROM public.user_agenda_status uas
    WHERE uas.user_id = v_speaker.user_id
      AND uas.event_id = v_event_id
      AND uas.slot_time IS NOT NULL
      AND uas.slot_status IN ('available', 'interested')
      AND (p_date IS NULL OR uas.slot_time::date = p_date)
      AND uas.slot_time >= now()
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
      m.speaker_id = v_speaker.id
      OR m.host_id = v_speaker.user_id
      OR m.requester_id = v_speaker.user_id
    )
      AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
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
        AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
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
    WHERE (m.speaker_id = v_speaker.id OR m.host_id = v_speaker.user_id)
      AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
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
      AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
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
  -- 'tentative' the same as 'confirmed' for that purpose).
  UPDATE public.user_agenda_status
  SET status = 'confirmed', confirmed_at = now(), slot_status = 'confirmed',
      meeting_id = v_meeting_id, updated_at = now()
  WHERE user_id = v_speaker.user_id
    AND event_id = v_request.event_id
    AND slot_time = p_slot_start_time;
  IF NOT FOUND THEN
    INSERT INTO public.user_agenda_status (
      user_id, agenda_id, event_id, status, confirmed_at, slot_time, slot_status,
      meeting_id, created_at, updated_at
    ) VALUES (
      v_speaker.user_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
      p_slot_start_time, 'confirmed', v_meeting_id, now(), now()
    );
  END IF;

  UPDATE public.user_agenda_status
  SET status = 'confirmed', confirmed_at = now(), slot_status = 'confirmed',
      meeting_id = v_meeting_id, updated_at = now()
  WHERE user_id = v_request.requester_id
    AND event_id = v_request.event_id
    AND slot_time = p_slot_start_time;
  IF NOT FOUND THEN
    INSERT INTO public.user_agenda_status (
      user_id, agenda_id, event_id, status, confirmed_at, slot_time, slot_status,
      meeting_id, created_at, updated_at
    ) VALUES (
      v_request.requester_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
      p_slot_start_time, 'confirmed', v_meeting_id, now(), now()
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

-- Lets the requester of a 'tentative' meeting (one accepted despite
-- colliding with their own existing booking) explicitly choose to replace
-- the old meeting(s) with this new one, or keep the old one(s) and drop
-- this new one. Mirrors cancel_meeting_request's free-slot/notify pattern.
CREATE OR REPLACE FUNCTION public.resolve_meeting_slot_conflict(
  p_meeting_id uuid,
  p_user_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      UPDATE public.meeting_slots
      SET status = 'available', meeting_id = NULL, updated_at = now()
      WHERE meeting_id = v_old.id;
      DELETE FROM public.user_agenda_status WHERE meeting_id = v_old.id;
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
    UPDATE public.meeting_slots
    SET status = 'available', meeting_id = NULL, updated_at = now()
    WHERE meeting_id = p_meeting_id;
    DELETE FROM public.user_agenda_status WHERE meeting_id = p_meeting_id;
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

GRANT EXECUTE ON FUNCTION public.resolve_meeting_slot_conflict(uuid, uuid, text)
  TO authenticated;
