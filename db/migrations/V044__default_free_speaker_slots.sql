-- get_speaker_available_slots previously required an EXPLICIT meeting_slots
-- or user_agenda_status row marked 'available' before a time would ever be
-- offered to a requester. But my-schedule.tsx (the speaker's own calendar
-- view) already displays every unmarked slot as free by default
-- (`userFreeSlotStatus[slotKey] || 'available'`) -- it just never wrote that
-- default back to the database. The two disagreed: a speaker who had marked
-- nothing busy still showed zero bookable slots to requesters.
--
-- For events with a configured date window (events.starts_at/ends_at/
-- timezone -- true for chile2026/colombia2026/peru2026, not for the legacy
-- bsl/bsl2025 hub tenants), this generates every 15-minute slot in the
-- event's own local 7am-7pm working hours (matching my-schedule.tsx's
-- WORKING_HOURS/TIME_SLOT_MINUTES constants exactly) and only EXCLUDES a
-- slot when the speaker has explicitly marked it busy: meeting_slots.status
-- NOT 'available', or a user_agenda_status row that isn't a free/interested
-- marker (a real agenda session, an existing meeting, or an explicit
-- 'blocked' mark). Everything else -- the untouched majority -- is free by
-- default, matching the calendar screen's own display.
--
-- Tenants without a configured window keep the prior opt-in-only behavior,
-- since there is no bounded range to synthesize a default-free series from.

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
