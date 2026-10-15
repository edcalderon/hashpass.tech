-- ============================================================================
-- V116: Keep unclaimed speaker profiles pending, not active or inactive
-- ============================================================================
-- An imported profile is public and can receive a meeting request while it
-- waits for the speaker to claim it. `is_active` is reserved for a claimed
-- speaker's explicit profile setting. This preserves inactive choices made by
-- claimed speakers and lets pending requests be relinked on claim.

BEGIN;

ALTER TABLE public.bsl_speakers
  ALTER COLUMN is_active SET DEFAULT false,
  ALTER COLUMN directory_visible SET DEFAULT true;

UPDATE public.bsl_speakers
   SET directory_visible = true,
       is_active = false,
       is_accepting_meetings = true,
       updated_at = now()
 WHERE user_id IS NULL
   AND (
     (event_id = 'colombia2026' AND metadata ->> 'source' = 'blockchainsummit-colombia2026')
     OR (event_id = 'bsl2025' AND metadata ->> 'source' = 'packages/config/src/events.ts')
   );

-- New programme rows start pending. Existing claimed rows retain their active
-- or inactive choice; retired rows become private and inactive.
CREATE OR REPLACE FUNCTION public.sync_bsl_public_programme(
  p_event_id text,
  p_source_id text,
  p_speakers jsonb,
  p_agenda jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_speaker_count integer;
  v_agenda_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_event_id !~ '^[a-z0-9-]{2,80}$' OR p_source_id !~ '^[a-z0-9-]{2,100}$' THEN
    RAISE EXCEPTION 'invalid event or source id' USING ERRCODE = '22023';
  END IF;
  v_speaker_count := jsonb_array_length(p_speakers);
  v_agenda_count := jsonb_array_length(p_agenda);
  IF v_speaker_count < 10 OR v_speaker_count > 500 OR v_agenda_count < 20 OR v_agenda_count > 1000 THEN
    RAISE EXCEPTION 'programme size outside safety bounds' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bsl_speakers
    (event_id, slug, name, title, company, bio, imageurl, is_active,
     is_accepting_meetings, directory_visible, metadata, updated_at)
  SELECT p_event_id, x.slug, x.name, x.title, x.company, x.bio, x.imageurl,
    false, true, true, x.metadata, x.updated_at
  FROM jsonb_to_recordset(p_speakers) AS x(
    slug text, name text, title text, company text, bio text, imageurl text,
    metadata jsonb, updated_at timestamptz
  )
  ON CONFLICT (event_id, slug) WHERE slug IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name,
    title = EXCLUDED.title,
    company = EXCLUDED.company,
    bio = EXCLUDED.bio,
    imageurl = EXCLUDED.imageurl,
    is_active = CASE
      WHEN public.bsl_speakers.user_id IS NULL THEN false
      ELSE public.bsl_speakers.is_active
    END,
    is_accepting_meetings = CASE
      WHEN public.bsl_speakers.user_id IS NULL THEN true
      ELSE public.bsl_speakers.is_accepting_meetings
    END,
    directory_visible = CASE
      WHEN public.bsl_speakers.user_id IS NULL THEN true
      ELSE public.bsl_speakers.directory_visible
    END,
    metadata = EXCLUDED.metadata,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.bsl_speakers speaker
  SET is_active = false,
      is_accepting_meetings = false,
      directory_visible = false,
      updated_at = now()
  WHERE speaker.event_id = p_event_id
    AND speaker.metadata ->> 'source' = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_speakers) item
      WHERE item ->> 'slug' = speaker.slug
    );

  INSERT INTO public.event_agenda
    (id, event_id, source_id, time, title, description, speakers, type,
     location, day, day_name, updated_at)
  SELECT x.id, p_event_id, p_source_id, x.time, x.title, x.description,
    x.speakers, x.type, x.location, x.day, x.day_name, x.updated_at
  FROM jsonb_to_recordset(p_agenda) AS x(
    id text, time timestamptz, title text, description text, speakers text[],
    type text, location text, day text, day_name text, updated_at timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    event_id = EXCLUDED.event_id,
    source_id = EXCLUDED.source_id,
    time = EXCLUDED.time,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    speakers = EXCLUDED.speakers,
    type = EXCLUDED.type,
    location = EXCLUDED.location,
    day = EXCLUDED.day,
    day_name = EXCLUDED.day_name,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM public.event_agenda agenda
  WHERE agenda.event_id = p_event_id
    AND agenda.source_id = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_agenda) item
      WHERE item ->> 'id' = agenda.id
    );

  RETURN jsonb_build_object('speakers', v_speaker_count, 'agenda', v_agenda_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_make_meeting_request(
  p_user_id text,
  p_speaker_id text,
  p_boost_amount numeric DEFAULT 0,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  can_request boolean,
  reason text,
  pass_type text,
  remaining_requests integer,
  remaining_boost numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'));
  v_speaker RECORD;
  v_pass RECORD;
  v_existing_request RECORD;
  v_blocked boolean := false;
  v_pending boolean := false;
  v_directory_visible boolean := false;
  v_remaining_requests integer := 0;
  v_remaining_boost numeric := 0;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.id IS NULL THEN
    RETURN QUERY SELECT false, 'speaker_not_found', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  -- get_speaker_by_id_or_slug predates directory_visible, so read the new
  -- publication flag from the base row instead of assuming every unclaimed
  -- record is public.
  SELECT COALESCE(directory_visible, false)
    INTO v_directory_visible
    FROM public.bsl_speakers
   WHERE id::text = v_speaker.id
   LIMIT 1;
  v_pending := v_speaker.user_id IS NULL AND v_directory_visible;

  SELECT p.id, p.pass_type::text AS pass_type, p.max_meeting_requests,
    p.used_meeting_requests, p.max_boost_amount, p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pass.id IS NULL THEN
    RETURN QUERY SELECT false, 'no_valid_pass', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT v_pending AND NOT (v_speaker.user_id IS NOT NULL AND COALESCE(v_speaker.is_active, false)) THEN
    RETURN QUERY SELECT false, 'speaker_inactive', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT v_pending AND NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN QUERY SELECT false, 'not_accepting_meetings', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  v_remaining_requests := GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - COALESCE(v_pass.used_meeting_requests, 0));
  v_remaining_boost := GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0));

  SELECT * INTO v_existing_request
  FROM public.meeting_requests mr
  WHERE mr.requester_id::text = p_user_id
    AND mr.event_id = v_event_id
    AND mr.status IN ('pending', 'requested', 'approved', 'accepted')
    AND (mr.speaker_id::text = v_speaker.id::text OR (v_speaker.user_id IS NOT NULL AND mr.speaker_id::text = v_speaker.user_id::text))
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'existing_request', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocked_user_id = p_user_id::uuid AND (ub.speaker_id::text = v_speaker.id::text OR ub.blocker_user_id = v_speaker.user_id))
       OR (ub.blocker_user_id = p_user_id::uuid AND v_speaker.user_id IS NOT NULL AND ub.blocked_user_id = v_speaker.user_id)
  ) INTO v_blocked;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;
  IF v_remaining_requests <= 0 THEN
    RETURN QUERY SELECT false, 'no_requests_remaining', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;
  IF COALESCE(p_boost_amount, 0) > v_remaining_boost THEN
    RETURN QUERY SELECT false, 'insufficient_boost', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
END;
$$;

COMMIT;
