-- meetings.speaker_id is `uuid` on prod but `text` on dev (bsl_speakers.id
-- itself diverges the same way -- V048 already fixed the READ-side
-- comparison for this). The WRITE side (accept_meeting_request's INSERT
-- INTO meetings) was never fixed: a static VALUES clause binds v_speaker.id
-- (always text) against ONE column type at CREATE FUNCTION time, so it can
-- only ever match one environment. Confirmed live on prod via a rolled-back
-- E2E transaction while verifying V050: "column speaker_id is of type uuid
-- but expression is of type text" -- meaning no meeting has ever actually
-- been created on production through this function. Switch that one INSERT
-- to EXECUTE format(...%L...) so each environment parses the literal
-- against its own real column type at runtime, same as a hand-typed insert.
--
-- This replaces the function body V050 just established (registry-id
-- resolution for user_agenda_status) -- that part is carried forward
-- unchanged below; only the meetings INSERT changes in this migration.

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

  v_duration := COALESCE(v_request.duration_minutes, 15);
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
  IF v_speaker_registry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_speaker_registry_id
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
  ) OR (v_requester_registry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_requester_registry_id
      AND uas.slot_time = p_slot_start_time
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
