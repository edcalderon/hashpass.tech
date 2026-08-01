-- Production speaker rows have a slug while legacy development rows do not.
-- Reading the optional field from the row JSON keeps the public lookup RPC
-- compatible with both schemas.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_speaker_by_id_or_slug(p_id text)
RETURNS TABLE (
  id text,
  name text,
  title text,
  company text,
  bio text,
  imageurl text,
  linkedin text,
  twitter text,
  tags text[],
  availability jsonb,
  user_id uuid,
  is_active boolean,
  is_accepting_meetings boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id::text,
    s.name,
    s.title,
    s.company,
    s.bio,
    s.imageurl,
    s.linkedin,
    s.twitter,
    s.tags,
    s.availability,
    s.user_id,
    s.is_active,
    s.is_accepting_meetings,
    s.created_at,
    s.updated_at
  FROM public.bsl_speakers s
  WHERE s.id::text = p_id
     OR lower(s.name) = lower(p_id)
     OR lower(COALESCE(to_jsonb(s)->>'slug', '')) = lower(p_id)
     OR s.user_id::text = p_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_speaker_by_id_or_slug(text) TO authenticated;

COMMIT;
