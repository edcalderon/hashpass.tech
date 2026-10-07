-- ============================================================================
-- V113: Keep unclaimed speaker profiles private
-- ============================================================================
-- V111 introduced an explicit publication flag, but its initial backfill made
-- imported profiles visible before ownership was verified. Public speaker
-- discovery now requires both directory_visible=true and a linked account.
-- New sync imports already default directory_visible to false; this backfill
-- removes visibility from every existing unclaimed row without touching claims.
-- ============================================================================

BEGIN;

UPDATE public.bsl_speakers
   SET directory_visible = false,
       is_accepting_meetings = false,
       updated_at = now()
 WHERE user_id IS NULL
   AND (directory_visible IS DISTINCT FROM false OR is_accepting_meetings IS DISTINCT FROM false);

-- Keep the claim request workflow usable from a private, organizer-supplied
-- link. Knowing the exact opaque profile id is not publication: the requester
-- still needs a confirmed email and an event administrator must approve the
-- exact profile before it becomes visible or linked.
CREATE OR REPLACE FUNCTION public.request_speaker_profile_claim(
  p_speaker_id text,
  p_requester_user_id uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_speaker public.bsl_speakers%ROWTYPE;
  v_existing public.speaker_claim_requests%ROWTYPE;
  v_email text;
BEGIN
  SELECT lower(email)
    INTO v_email
    FROM auth.users
   WHERE id = p_requester_user_id
     AND email IS NOT NULL
     AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'A confirmed email is required to request a speaker profile claim'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_speaker
    FROM public.bsl_speakers
   WHERE id::text = btrim(COALESCE(p_speaker_id, ''))
     AND user_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker profile is not available for claiming'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.bsl_speakers
     WHERE user_id = p_requester_user_id
  ) THEN
    RAISE EXCEPTION 'This account is already linked to a speaker profile'
      USING ERRCODE = '23505';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.speaker_claim_requests
   WHERE speaker_id = v_speaker.id::text
     AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'claim_id', v_existing.id,
      'speaker_id', v_existing.speaker_id,
      'status', v_existing.status
    );
  END IF;

  INSERT INTO public.speaker_claim_requests (
    speaker_id,
    event_id,
    requester_user_id,
    request_note
  ) VALUES (
    v_speaker.id::text,
    v_speaker.event_id,
    p_requester_user_id,
    NULLIF(left(btrim(COALESCE(p_note, '')), 1000), '')
  )
  RETURNING * INTO v_existing;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_requester_user_id,
    v_speaker.event_id,
    'speaker_claim.requested',
    'speaker',
    v_speaker.id::text,
    jsonb_build_object('claim_id', v_existing.id)
  );

  RETURN jsonb_build_object(
    'claim_id', v_existing.id,
    'speaker_id', v_existing.speaker_id,
    'status', v_existing.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_speaker_profile_claim(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_speaker_profile_claim(text, uuid, text)
  TO service_role;

COMMIT;
