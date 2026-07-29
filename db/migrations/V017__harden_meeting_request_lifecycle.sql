-- Make the meeting request lifecycle safe for the demo flow:
-- speaker response authorization, mutually available slots, calendars,
-- notifications, and a meeting id that powers the existing chat screen.

-- Existing callers pass the UUID speaker record while the original helper takes
-- text. Keep both contracts working so request creation can notify both sides.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_meeting_request_id uuid,
  p_speaker_id uuid,
  p_is_urgent boolean,
  p_meeting_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_notification(
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_meeting_request_id,
    p_speaker_id::text,
    p_is_urgent,
    p_meeting_id
  );
$$;

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

  IF EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.requester_id = v_request.requester_id
      AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'requester_slot_conflict');
  END IF;

  -- A free-slot marker may be replaced by the meeting; real agenda entries may not.
  IF EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id IN (v_speaker.user_id, v_request.requester_id)
      AND uas.slot_time = p_slot_start_time
      AND NOT (
        uas.agenda_id IS NULL
        AND uas.meeting_id IS NULL
        AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'agenda_slot_conflict');
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
    COALESCE(v_request.meeting_type, 'networking'), 'confirmed',
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

  PERFORM public.create_notification(
    v_request.requester_id, 'meeting_accepted', 'Meeting Request Accepted',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' accepted your meeting request.',
    v_request.id, v_speaker.id::text, false, v_meeting_id
  );

  RETURN jsonb_build_object(
    'success', true, 'meeting_id', v_meeting_id, 'slot_id', v_slot_id,
    'start_time', p_slot_start_time, 'end_time', v_end_time, 'status', 'confirmed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_meeting_request(
  p_request_id text,
  p_speaker_id text,
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
    AND mr.status IN ('pending', 'requested', 'accepted')
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  UPDATE public.meeting_requests
  SET status = 'declined',
      speaker_response = COALESCE(p_speaker_response, 'Meeting request declined'),
      speaker_response_at = now(), updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.requester_id, 'meeting_declined', 'Meeting Request Declined',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' declined your meeting request.',
    v_request.id, v_speaker.id::text, false, NULL
  );
  RETURN jsonb_build_object('success', true, 'status', 'declined');
END;
$$;

CREATE OR REPLACE FUNCTION public.block_user_and_decline_request(
  p_request_id text,
  p_speaker_id text,
  p_user_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
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
    AND mr.requester_id = p_user_id::uuid
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  INSERT INTO public.user_blocks (
    speaker_id, blocker_user_id, blocked_user_id, reason, blocked_at, is_muted
  ) VALUES (
    v_speaker.id, v_speaker.user_id, p_user_id::uuid, p_reason, now(), false
  )
  ON CONFLICT (speaker_id, blocked_user_id) DO UPDATE SET
    blocker_user_id = EXCLUDED.blocker_user_id,
    reason = COALESCE(EXCLUDED.reason, public.user_blocks.reason),
    blocked_at = now(),
    is_muted = COALESCE(EXCLUDED.is_muted, public.user_blocks.is_muted);

  UPDATE public.meeting_requests
  SET status = 'declined', speaker_response = COALESCE(p_reason, 'User blocked'),
      speaker_response_at = now(), updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.requester_id, 'meeting_declined', 'Meeting Request Declined',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' declined your meeting request.',
    v_request.id, v_speaker.id::text, false, NULL
  );
  RETURN jsonb_build_object(
    'success', true, 'status', 'declined', 'blocked_user_id', p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_meeting_request(
  p_request_id text,
  p_user_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    UPDATE public.meeting_slots
    SET status = 'available', meeting_id = NULL, updated_at = now()
    WHERE meeting_id = v_request.meeting_id;
    DELETE FROM public.user_agenda_status
    WHERE meeting_id = v_request.meeting_id;
  END IF;

  PERFORM public.create_notification(
    v_request.speaker_id, 'meeting_cancelled', 'Meeting Request Cancelled',
    COALESCE(v_request.requester_name, 'A user') || ' cancelled their meeting request.',
    v_request.id, NULL, false, v_request.meeting_id
  );
  RETURN true;
END;
$$;
