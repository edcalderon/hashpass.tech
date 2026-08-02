-- Let BSL hub administrators manage every event in their tour, and remove the
-- obsolete availability RPC overload that PostgREST cannot resolve reliably.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_event_admin_access(
  p_user_id uuid,
  p_event_id text,
  p_include_moderator boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) OR EXISTS (
    SELECT 1
    FROM public.event_roles er
    WHERE er.user_id = p_user_id
      AND (er.expires_at IS NULL OR er.expires_at > now())
      AND (er.role = 'event_admin'::public.event_role
        OR (p_include_moderator AND er.role = 'moderator'::public.event_role))
      AND (
        er.event_id = p_event_id
        OR EXISTS (
          SELECT 1
          FROM public.events target_event
          WHERE target_event.id = p_event_id
            AND target_event.metadata ->> 'hubEventId' = er.event_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_event_admin_access(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_event_admin_access(uuid, text, boolean) TO authenticated, service_role;

-- The old three-argument signature coexists with the event-aware version in
-- older tenants. A three-field PostgREST RPC payload therefore matches both
-- and produces PGRST203. The event-aware function below remains the only
-- public contract.
DROP FUNCTION IF EXISTS public.get_speaker_available_slots(text, date, integer);

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

GRANT EXECUTE ON FUNCTION public.get_speaker_available_slots(text, date, integer, text, text)
  TO authenticated;

COMMIT;
