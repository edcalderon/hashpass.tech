-- ============================================================================
-- V185: Let event admins manage speakers stored in public.speakers
-- ============================================================================
-- V108 binds admin_manage_speaker_role to the event but only looks in
-- public.bsl_speakers, so event-scoped profiles such as the official CBWeek
-- 2026 speakers (public.speakers, V181) could not be assigned, revoked or
-- toggled from the admin Speaker Roles screen. This keeps the bsl_speakers path
-- byte-for-byte equivalent to V108 and adds a public.speakers path scoped by
-- event_id, mirroring V183's claim approval:
--   * the account/active state lives on speakers.user_id + metadata.is_active;
--   * a person may be linked to one profile per event, not one globally, so
--     speaker_identity_claims (unique per email/account across events) is not
--     written for event speakers.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_manage_speaker_role(
  p_actor_user_id uuid,
  p_event_id text,
  p_action text,
  p_speaker_id text,
  p_target_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_speaker_user_id uuid;
  v_target_user_id uuid;
  v_target_email text;
  v_speaker_name text;
  v_is_active boolean;
  v_is_event_speaker boolean := false;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may manage speaker assignments'
      USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('grant', 'revoke', 'activate', 'deactivate') THEN
    RAISE EXCEPTION 'Unsupported speaker management action' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Unknown event' USING ERRCODE = '22023';
  END IF;

  SELECT user_id, name, COALESCE(is_active, false)
    INTO v_speaker_user_id, v_speaker_name, v_is_active
    FROM public.bsl_speakers
   WHERE id::text = p_speaker_id
     AND event_id = p_event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    SELECT user_id, name, COALESCE((metadata->>'is_active')::boolean, false)
      INTO v_speaker_user_id, v_speaker_name, v_is_active
      FROM public.speakers
     WHERE id::text = p_speaker_id
       AND event_id = p_event_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown speaker profile for this event' USING ERRCODE = '22023';
    END IF;
    v_is_event_speaker := true;
  END IF;

  IF p_action = 'grant' THEN
    v_target_email := lower(btrim(COALESCE(p_target_email, '')));
    IF v_target_email = '' OR position('@' IN v_target_email) < 2 THEN
      RAISE EXCEPTION 'A valid existing account email is required' USING ERRCODE = '22023';
    END IF;

    SELECT id, lower(email)
      INTO v_target_user_id, v_target_email
      FROM auth.users
     WHERE lower(email) = v_target_email
       AND email_confirmed_at IS NOT NULL
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No verified email account exists for this email' USING ERRCODE = '22023';
    END IF;

    IF v_speaker_user_id IS NOT NULL AND v_speaker_user_id <> v_target_user_id THEN
      RAISE EXCEPTION 'This speaker is already assigned to another account; revoke it first'
        USING ERRCODE = '23505';
    END IF;

    IF v_is_event_speaker THEN
      IF EXISTS (
        SELECT 1
          FROM public.speakers
         WHERE event_id = p_event_id
           AND user_id = v_target_user_id
           AND id::text <> p_speaker_id
      ) THEN
        RAISE EXCEPTION 'This account is already assigned to another speaker profile'
          USING ERRCODE = '23505';
      END IF;

      UPDATE public.speakers
         SET user_id = v_target_user_id,
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'is_active', true,
               'is_accepting_meetings', true,
               'directory_visible', true,
               'claimed_via', 'admin_speaker_role'
             ),
             updated_at = now()
       WHERE id::text = p_speaker_id
         AND event_id = p_event_id;
    ELSE
      IF EXISTS (
        SELECT 1
          FROM public.bsl_speakers
         WHERE user_id = v_target_user_id
           AND id::text <> p_speaker_id
      ) THEN
        RAISE EXCEPTION 'This account is already assigned to another speaker profile'
          USING ERRCODE = '23505';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.speaker_identity_claims
         WHERE claimed_user_id = v_target_user_id
           AND speaker_id <> p_speaker_id
      ) THEN
        RAISE EXCEPTION 'This account already has a claimed speaker identity'
          USING ERRCODE = '23505';
      END IF;
      IF EXISTS (
        SELECT 1
          FROM public.speaker_identity_claims
         WHERE email_normalized = v_target_email
           AND speaker_id <> p_speaker_id
      ) THEN
        RAISE EXCEPTION 'This email is configured for another speaker identity'
          USING ERRCODE = '23505';
      END IF;

      UPDATE public.bsl_speakers
         SET user_id = v_target_user_id,
             is_active = true,
             updated_at = now()
       WHERE id::text = p_speaker_id
         AND event_id = p_event_id;

      INSERT INTO public.speaker_identity_claims (
        speaker_id,
        email_normalized,
        status,
        configured_by,
        claimed_user_id,
        claimed_at,
        metadata
      ) VALUES (
        p_speaker_id,
        v_target_email,
        'claimed',
        p_actor_user_id,
        v_target_user_id,
        now(),
        jsonb_build_object('source', 'admin_speaker_role')
      )
      ON CONFLICT (speaker_id) DO UPDATE
        SET email_normalized = EXCLUDED.email_normalized,
            status = 'claimed',
            configured_by = EXCLUDED.configured_by,
            claimed_user_id = EXCLUDED.claimed_user_id,
            claimed_at = EXCLUDED.claimed_at,
            claim_error = NULL,
            metadata = EXCLUDED.metadata,
            updated_at = now();
    END IF;

  ELSIF p_action = 'revoke' THEN
    IF v_is_event_speaker THEN
      UPDATE public.speakers
         SET user_id = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('is_active', false),
             updated_at = now()
       WHERE id::text = p_speaker_id
         AND event_id = p_event_id;
    ELSE
      UPDATE public.bsl_speakers
         SET user_id = NULL,
             is_active = false,
             updated_at = now()
       WHERE id::text = p_speaker_id
         AND event_id = p_event_id;
      DELETE FROM public.speaker_identity_claims WHERE speaker_id = p_speaker_id;
    END IF;

  ELSE
    IF p_action = 'activate' AND v_speaker_user_id IS NULL THEN
      RAISE EXCEPTION 'Assign an account before activating a speaker' USING ERRCODE = '22023';
    END IF;
    IF v_is_event_speaker THEN
      UPDATE public.speakers
         SET metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('is_active', p_action = 'activate'),
             updated_at = now()
       WHERE id::text = p_speaker_id
         AND event_id = p_event_id;
    ELSE
      UPDATE public.bsl_speakers
         SET is_active = (p_action = 'activate'),
             updated_at = now()
       WHERE id::text = p_speaker_id
         AND event_id = p_event_id;
    END IF;
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    p_event_id,
    'speaker_role.' || p_action,
    'speaker',
    p_speaker_id,
    jsonb_build_object('speaker_name', v_speaker_name, 'target_email', v_target_email)
  );

  IF v_is_event_speaker THEN
    SELECT COALESCE((metadata->>'is_active')::boolean, false)
      INTO v_is_active
      FROM public.speakers
     WHERE id::text = p_speaker_id
       AND event_id = p_event_id;
  ELSE
    SELECT COALESCE(is_active, false)
      INTO v_is_active
      FROM public.bsl_speakers
     WHERE id::text = p_speaker_id
       AND event_id = p_event_id;
  END IF;

  RETURN jsonb_build_object(
    'speaker_id', p_speaker_id,
    'action', p_action,
    'is_active', v_is_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_speaker_role(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_speaker_role(uuid, text, text, text, text)
  TO service_role;

COMMIT;
