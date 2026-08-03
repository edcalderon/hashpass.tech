-- Ensure encrypted meeting-chat rows are published to Supabase Realtime.
-- Without this publication, clients only receive history on mount and have
-- to reopen the screen to see messages sent by the other participant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_rel rel
      JOIN pg_publication publication ON publication.oid = rel.prpubid
      JOIN pg_class relation ON relation.oid = rel.prrelid
      JOIN pg_namespace schema ON schema.oid = relation.relnamespace
      WHERE publication.pubname = 'supabase_realtime'
        AND schema.nspname = 'public'
        AND relation.relname = 'meeting_chat_messages'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_chat_messages;
  END IF;
END;
$$;

-- Provide the identity shown in a chat without exposing auth.users to the
-- client. Speaker photos remain the canonical BSL speaker image; attendees
-- use their actual public profile avatar where available.
CREATE OR REPLACE FUNCTION public.get_meeting_chat_participant(
  p_meeting_id uuid,
  p_other_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting public.meetings%ROWTYPE;
  v_name text;
  v_avatar_url text;
BEGIN
  SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  IF auth.uid() IS NULL OR (
    auth.uid() IS DISTINCT FROM v_meeting.requester_id
    AND auth.uid() IS DISTINCT FROM v_meeting.host_id
    AND auth.uid() IS DISTINCT FROM v_meeting.attendee_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bsl_speakers speaker
      WHERE speaker.id::text = v_meeting.speaker_id::text
        AND speaker.user_id = auth.uid()
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF p_other_user_id IS DISTINCT FROM v_meeting.requester_id
    AND p_other_user_id IS DISTINCT FROM v_meeting.host_id
    AND p_other_user_id IS DISTINCT FROM v_meeting.attendee_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bsl_speakers speaker
      WHERE speaker.id::text = v_meeting.speaker_id::text
        AND speaker.user_id = p_other_user_id
    ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  SELECT NULLIF(speaker.name, ''), NULLIF(speaker.imageurl, '')
  INTO v_name, v_avatar_url
  FROM public.bsl_speakers speaker
  WHERE speaker.user_id = p_other_user_id
  LIMIT 1;

  IF v_name IS NULL OR v_avatar_url IS NULL THEN
    SELECT
      COALESCE(v_name, NULLIF(profile.display_name, ''), NULLIF(profile.full_name, '')),
      COALESCE(v_avatar_url, NULLIF(profile.avatar_url, ''))
    INTO v_name, v_avatar_url
    FROM public.user_profiles profile
    WHERE profile.user_id::text = p_other_user_id::text
    LIMIT 1;
  END IF;

  IF v_name IS NULL OR v_avatar_url IS NULL THEN
    SELECT
      COALESCE(v_name, NULLIF(profile.full_name, ''), NULLIF(registry.full_name, '')),
      COALESCE(v_avatar_url, NULLIF(profile.avatar_url, ''), NULLIF(registry.avatar_url, ''))
    INTO v_name, v_avatar_url
    FROM public."user" registry
    LEFT JOIN public.profiles profile ON profile.id = registry.id
    WHERE registry.auth_user_id = p_other_user_id::text
       OR registry.provider_ids->>'supabase' = p_other_user_id::text
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'name', v_name,
    'avatar_url', v_avatar_url
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_meeting_chat_participant(uuid, uuid) TO authenticated;
