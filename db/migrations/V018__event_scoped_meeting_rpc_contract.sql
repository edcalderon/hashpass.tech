-- The shared event API passes the event identity explicitly.  Do not rely on
-- app.event_id here: PostgREST RPC calls do not set that transaction setting.

DROP FUNCTION IF EXISTS public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz
);

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
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_request_id uuid := gen_random_uuid();
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

DROP FUNCTION IF EXISTS public.get_speaker_available_slots(text, date, integer, text);

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
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_speaker_available_slots(text, date, integer, text, text)
  TO authenticated;
