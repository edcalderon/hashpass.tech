-- Speaker profile photo: event photo vs the speaker's personal profile photo.
--
-- bsl_speakers.imageurl stays the EFFECTIVE public image (directory, chat and
-- meeting RPCs already read it). event_imageurl remembers the event-assigned
-- photo so a speaker can always switch back to it; avatar_source records which
-- one imageurl currently mirrors.

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS event_imageurl text,
  ADD COLUMN IF NOT EXISTS avatar_source text NOT NULL DEFAULT 'event';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bsl_speakers_avatar_source_check'
  ) THEN
    ALTER TABLE public.bsl_speakers
      ADD CONSTRAINT bsl_speakers_avatar_source_check
      CHECK (avatar_source IN ('event', 'personal'));
  END IF;
END $$;

UPDATE public.bsl_speakers
SET event_imageurl = imageurl
WHERE event_imageurl IS NULL AND imageurl IS NOT NULL;

-- Do-not-disturb: a confirmed speaker keeps receiving meeting requests, but
-- they are archived instead of surfacing directly (like phone notifications).
ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS do_not_disturb boolean NOT NULL DEFAULT false;

-- Archived requests stay on record (and visible to the requester) but are not
-- surfaced in the speaker's incoming list. meeting_requests.status is text with
-- a CHECK constraint (V038), not an enum, so extend the constraint.
ALTER TABLE public.meeting_requests DROP CONSTRAINT IF EXISTS meeting_requests_status_check;
ALTER TABLE public.meeting_requests ADD CONSTRAINT meeting_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'requested', 'approved', 'accepted', 'declined', 'rejected',
    'expired', 'cancelled', 'completed', 'confirmed', 'archived'
  ]));

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
  v_target_speaker_id uuid;
  v_dnd boolean := false;
  v_status text := 'pending';
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.id IS NULL THEN
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

  v_target_speaker_id := COALESCE(v_speaker.user_id, v_speaker.id::uuid);

  -- Do-not-disturb: a claimed, active speaker still receives the request, but
  -- it is archived instead of surfacing (no notification, hidden from their inbox).
  SELECT COALESCE(s.do_not_disturb, false) INTO v_dnd
  FROM public.bsl_speakers s
  WHERE s.id::text = v_speaker.id
  LIMIT 1;
  v_dnd := COALESCE(v_dnd, false)
    AND v_speaker.user_id IS NOT NULL
    AND COALESCE(v_speaker.is_active, false);
  IF v_dnd THEN
    v_status := 'archived';
  END IF;

  INSERT INTO public.meeting_requests (
    id, requester_id, speaker_id, event_id, speaker_name, requester_name,
    requester_company, requester_title, requester_ticket_type, meeting_type,
    message, note, boost_amount, duration_minutes, expires_at, status,
    created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id::uuid, v_target_speaker_id, v_event_id,
    p_speaker_name, p_requester_name, p_requester_company, p_requester_title,
    p_requester_ticket_type, COALESCE(NULLIF(p_meeting_type, ''), 'networking'),
    COALESCE(p_message, ''), p_note, COALESCE(p_boost_amount, 0),
    COALESCE(p_duration_minutes, 15), COALESCE(p_expires_at, now() + interval '3 days'),
    v_status, now(), now()
  );

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

  -- An unclaimed profile has no auth recipient yet. The claim trigger below
  -- relinks this request to the eventual account before notifications begin.
  IF v_speaker.user_id IS NOT NULL AND NOT v_dnd THEN
    PERFORM public.send_prioritized_notification(
      v_speaker.user_id::text, p_requester_name, p_requester_company,
      p_requester_ticket_type, COALESCE(p_boost_amount, 0), v_request_id
    );
  END IF;

  RETURN QUERY
  SELECT v_request_id, p_requester_id::uuid, v_target_speaker_id, v_status, now();
END;
$$;

REVOKE ALL ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) TO authenticated, service_role;
