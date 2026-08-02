-- ============================================================================
-- V036: Require a verified email before an administrator grants speaker access
-- ============================================================================
-- A phone-confirmed Supabase account can have confirmed_at populated even when
-- its email is still unverified. Speaker ownership and the privileges attached
-- to it are based on the email address, so this path must have the same
-- email_confirmed_at invariant as V029's self-service claim lifecycle.
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
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown speaker profile' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'grant' THEN
    v_target_email := lower(btrim(COALESCE(p_target_email, '')));
    IF v_target_email = '' OR position('@' IN v_target_email) < 2 THEN
      RAISE EXCEPTION 'A valid existing account email is required' USING ERRCODE = '22023';
    END IF;

    -- Only email confirmation proves that this account controls the address.
    -- Do not accept confirmed_at: it can reflect phone confirmation alone.
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
     WHERE id::text = p_speaker_id;

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

  ELSIF p_action = 'revoke' THEN
    UPDATE public.bsl_speakers
       SET user_id = NULL,
           is_active = false,
           updated_at = now()
     WHERE id::text = p_speaker_id;
    DELETE FROM public.speaker_identity_claims WHERE speaker_id = p_speaker_id;

  ELSE
    IF p_action = 'activate' AND v_speaker_user_id IS NULL THEN
      RAISE EXCEPTION 'Assign an account before activating a speaker' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bsl_speakers
       SET is_active = (p_action = 'activate'),
           updated_at = now()
     WHERE id::text = p_speaker_id;
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

  SELECT COALESCE(is_active, false)
    INTO v_is_active
    FROM public.bsl_speakers
   WHERE id::text = p_speaker_id;

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
