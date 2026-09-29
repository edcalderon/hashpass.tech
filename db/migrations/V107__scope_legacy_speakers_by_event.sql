BEGIN;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS event_id text;

UPDATE public.bsl_speakers
SET event_id = 'bsl2025'
WHERE event_id IS NULL OR btrim(event_id) = '';

ALTER TABLE public.bsl_speakers
  ALTER COLUMN event_id SET DEFAULT 'bsl2025',
  ALTER COLUMN event_id SET NOT NULL;

ALTER TABLE public.bsl_speakers
  DROP CONSTRAINT IF EXISTS bsl_speakers_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bsl_speakers_event_slug
  ON public.bsl_speakers (event_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bsl_speakers_event_active
  ON public.bsl_speakers (event_id, is_active, name);

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
    (event_id, slug, name, title, company, bio, imageurl, is_active, metadata, updated_at)
  SELECT p_event_id, x.slug, x.name, x.title, x.company, x.bio, x.imageurl,
    true, x.metadata, x.updated_at
  FROM jsonb_to_recordset(p_speakers) AS x(
    slug text, name text, title text, company text, bio text, imageurl text,
    metadata jsonb, updated_at timestamptz
  )
  ON CONFLICT (event_id, slug) WHERE slug IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name, title = EXCLUDED.title, company = EXCLUDED.company,
    bio = EXCLUDED.bio, imageurl = EXCLUDED.imageurl, is_active = true,
    metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at;

  UPDATE public.bsl_speakers speaker
  SET is_active = false, updated_at = now()
  WHERE speaker.event_id = p_event_id
    AND speaker.metadata ->> 'source' = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_speakers) item
      WHERE item ->> 'slug' = speaker.slug
    );

  INSERT INTO public.event_agenda
    (id, event_id, time, title, description, speakers, type, location, day, day_name, updated_at)
  SELECT x.id, p_event_id, x.time, x.title, x.description, x.speakers,
    x.type, x.location, x.day, x.day_name, x.updated_at
  FROM jsonb_to_recordset(p_agenda) AS x(
    id text, time timestamptz, title text, description text, speakers text[],
    type text, location text, day text, day_name text, updated_at timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    event_id = EXCLUDED.event_id, time = EXCLUDED.time, title = EXCLUDED.title,
    description = EXCLUDED.description, speakers = EXCLUDED.speakers,
    type = EXCLUDED.type, location = EXCLUDED.location, day = EXCLUDED.day,
    day_name = EXCLUDED.day_name, updated_at = EXCLUDED.updated_at;

  DELETE FROM public.event_agenda agenda
  WHERE agenda.event_id = p_event_id
    AND agenda.id LIKE p_event_id || '-%'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_agenda) item
      WHERE item ->> 'id' = agenda.id
    );

  RETURN jsonb_build_object('speakers', v_speaker_count, 'agenda', v_agenda_count);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_bsl_public_programme(text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_bsl_public_programme(text, text, jsonb, jsonb) TO service_role;

COMMIT;
