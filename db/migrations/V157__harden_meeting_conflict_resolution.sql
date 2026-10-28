-- Keep tentative-meeting resolution aligned with V156's acceptance checks.
-- A requester can be busy as a host/attendee, via a meeting_slots row, or via
-- an event agenda block. None of those conflicts may be silently promoted.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_meeting_slot_conflict(
  p_meeting_id uuid,
  p_user_id uuid,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting RECORD;
  v_conflict_ids uuid[];
  v_old RECORD;
  v_registry_id uuid;
  v_slot_conflict boolean := false;
  v_agenda_conflict boolean := false;
  v_blocked boolean := false;
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

  -- Match the requester-side meeting sources checked by accept_meeting_request:
  -- the person may be a requester, host, or attendee.
  SELECT array_agg(m.id) INTO v_conflict_ids
  FROM public.meetings m
  WHERE (
      m.requester_id = p_user_id
      OR m.host_id = p_user_id
      OR m.attendee_id = p_user_id
    )
    AND m.id <> p_meeting_id
    AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
    AND m.start_time < v_meeting.end_time
    AND m.end_time > v_meeting.start_time;

  -- A slot attached to one of the meetings above will be released with that
  -- meeting. Other occupied or explicitly unavailable rows are real blockers.
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_slots ms
    WHERE ms.user_id = p_user_id
      AND ms.status <> 'available'
      AND ms.start_time < v_meeting.end_time
      AND ms.end_time > v_meeting.start_time
      AND ms.meeting_id IS DISTINCT FROM p_meeting_id
      AND (
        ms.meeting_id IS NULL
        OR v_conflict_ids IS NULL
        OR NOT (ms.meeting_id = ANY(v_conflict_ids))
      )
  ) INTO v_slot_conflict;

  SELECT id INTO v_registry_id
  FROM public."user"
  WHERE auth_user_id = p_user_id::text
  LIMIT 1;

  IF v_registry_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_agenda_status uas
      WHERE uas.event_id = v_meeting.event_id
        AND uas.user_id = v_registry_id
        AND uas.meeting_id IS NULL
        AND uas.slot_time < v_meeting.end_time
        AND uas.slot_time + interval '15 minutes' > v_meeting.start_time
        AND NOT (
          uas.agenda_id IS NULL
          AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
        )
    ) INTO v_agenda_conflict;
  END IF;

  -- If the original conflict disappeared, still re-claim the full interval.
  -- Keep the user's explicit choice: keep_existing cancels the tentative
  -- meeting, while replace must re-claim the interval before confirming.
  IF v_conflict_ids IS NULL AND NOT v_slot_conflict AND NOT v_agenda_conflict THEN
    IF p_action = 'keep_existing' THEN
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
        COALESCE(v_meeting.requester_name, 'A user') || ' kept the existing meeting and cancelled this tentative meeting.',
        v_meeting.meeting_request_id, NULL, false, p_meeting_id
      );

      RETURN jsonb_build_object(
        'success', true, 'action', 'keep_existing', 'meeting_id', p_meeting_id,
        'status', 'cancelled', 'cancelled_meeting_ids', '{}'::uuid[]
      );
    END IF;

    v_blocked := public.block_meeting_interval(
      v_meeting.requester_id, v_meeting.start_time, v_meeting.end_time, p_meeting_id
    );
    IF NOT v_blocked THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'meeting_slot_conflict',
        'meeting_id', p_meeting_id, 'status', 'tentative',
        'requires_resolution', true
      );
    END IF;

    UPDATE public.meetings
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_meeting_id;

    RETURN jsonb_build_object(
      'success', true, 'action', 'already_resolved', 'meeting_id', p_meeting_id,
      'status', 'confirmed', 'cancelled_meeting_ids', '{}'::uuid[]
    );
  END IF;

  IF p_action = 'replace' THEN
    -- A manual unavailable slot or agenda block has no meeting to cancel, so
    -- replacing meetings cannot make the requested interval safe.
    IF v_slot_conflict OR v_agenda_conflict THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', CASE WHEN v_agenda_conflict THEN 'agenda_slot_conflict' ELSE 'meeting_slot_conflict' END,
        'meeting_id', p_meeting_id, 'status', 'tentative',
        'requires_resolution', true
      );
    END IF;

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

    v_blocked := public.block_meeting_interval(
      v_meeting.requester_id, v_meeting.start_time, v_meeting.end_time, p_meeting_id
    );
    IF NOT v_blocked THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'meeting_slot_conflict',
        'meeting_id', p_meeting_id, 'status', 'tentative',
        'requires_resolution', true
      );
    END IF;

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
