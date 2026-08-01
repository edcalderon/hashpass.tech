-- ============================================================================
-- V029: Harden verified speaker identity claims
-- ============================================================================
-- V028 is already deployed. Keep this as a forward-only migration so Flyway
-- checksums remain valid in every tenant.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.claim_speaker_profile_on_verified_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- A phone-confirmed account can have confirmed_at populated while its email
  -- is still unverified. Claims are based on ownership of NEW.email, so only
  -- an email confirmation is sufficient.
  IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.claim_speaker_profile_for_verified_auth_user(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_speaker_profile_on_verified_signup ON auth.users;
CREATE TRIGGER trg_claim_speaker_profile_on_verified_signup
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_speaker_profile_on_verified_signup();

CREATE OR REPLACE FUNCTION public.configure_speaker_identity_claim(
  p_actor_user_id uuid,
  p_speaker_id text,
  p_email text,
  p_event_role_grants jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim_id uuid;
  v_claim_status text;
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_existing_user record;
BEGIN
  IF NOT public.is_super_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Only a super admin may preconfigure event_admin or speaker identity claims'
      USING ERRCODE = '42501';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'A speaker claim requires an email address' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_event_role_grants) <> 'array' THEN
    RAISE EXCEPTION 'Event role grants must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bsl_speakers WHERE id::text = p_speaker_id) THEN
    RAISE EXCEPTION 'Unknown speaker profile' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bsl_speakers WHERE id::text = p_speaker_id AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Speaker profile is already linked to an account' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_event_role_grants) AS role_grant(event_id text, role text)
     WHERE role_grant.event_id IS NULL
        OR role_grant.role NOT IN ('event_admin', 'moderator')
        OR NOT EXISTS (SELECT 1 FROM public.events WHERE id = role_grant.event_id)
  ) THEN
    RAISE EXCEPTION 'Each event role grant must reference an existing event and a supported role'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.speaker_identity_claims (
    speaker_id,
    email_normalized,
    status,
    configured_by,
    metadata
  ) VALUES (
    p_speaker_id,
    v_email,
    'unclaimed',
    p_actor_user_id,
    jsonb_build_object('source', 'admin_configuration')
  )
  ON CONFLICT (speaker_id) DO UPDATE
    SET email_normalized = EXCLUDED.email_normalized,
        status = 'unclaimed',
        configured_by = EXCLUDED.configured_by,
        claimed_user_id = NULL,
        claimed_at = NULL,
        claim_error = NULL,
        updated_at = now()
    WHERE public.speaker_identity_claims.status <> 'claimed'
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'Claim is already completed and cannot be reconfigured' USING ERRCODE = '23505';
  END IF;

  DELETE FROM public.speaker_identity_claim_event_roles WHERE claim_id = v_claim_id;
  INSERT INTO public.speaker_identity_claim_event_roles (claim_id, event_id, role)
  SELECT v_claim_id, role_grant.event_id, role_grant.role::public.event_role
    FROM jsonb_to_recordset(p_event_role_grants) AS role_grant(event_id text, role text);

  INSERT INTO public.admin_action_log (actor_user_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    'speaker_identity.configured',
    'speaker',
    p_speaker_id::text,
    jsonb_build_object('claim_id', v_claim_id)
  );

  SELECT id, email
    INTO v_existing_user
    FROM auth.users
   WHERE lower(email) = v_email
     AND email_confirmed_at IS NOT NULL
   LIMIT 1;
  IF FOUND THEN
    PERFORM public.claim_speaker_profile_for_verified_auth_user(v_existing_user.id, v_existing_user.email);
  END IF;

  SELECT status
    INTO v_claim_status
    FROM public.speaker_identity_claims
   WHERE id = v_claim_id;

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'speaker_id', p_speaker_id,
    'status', v_claim_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.configure_speaker_identity_claim(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_speaker_identity_claim(uuid, text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.release_speaker_identity_claim_before_auth_user_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Remove only the event roles granted automatically by a speaker claim.
  DELETE FROM public.event_roles AS event_role
  USING public.speaker_identity_claims AS claim
  JOIN public.speaker_identity_claim_event_roles AS role_grant
    ON role_grant.claim_id = claim.id
  WHERE claim.claimed_user_id = OLD.id
    AND event_role.user_id = OLD.id
    AND event_role.event_id = role_grant.event_id
    AND event_role.role = role_grant.role
    AND event_role.metadata ->> 'source' = 'speaker_identity_claim'
    AND event_role.metadata ->> 'claim_id' = claim.id::text;

  UPDATE public.bsl_speakers AS speaker
     SET user_id = NULL,
         updated_at = now()
    FROM public.speaker_identity_claims AS claim
   WHERE claim.claimed_user_id = OLD.id
     AND speaker.id::text = claim.speaker_id
     AND speaker.user_id = OLD.id;

  UPDATE public.speaker_identity_claims
     SET status = 'unclaimed',
         claimed_user_id = NULL,
         claimed_at = NULL,
         claim_error = 'Claim released because the linked account was deleted',
         updated_at = now()
   WHERE claimed_user_id = OLD.id
     AND status = 'claimed';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_speaker_identity_claim_before_auth_user_delete ON auth.users;
CREATE TRIGGER trg_release_speaker_identity_claim_before_auth_user_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.release_speaker_identity_claim_before_auth_user_delete();

-- Claims configured after an account already exists must obey the same email
-- verification requirement as newly created accounts.
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT id, email
      FROM auth.users
     WHERE email IS NOT NULL
       AND email_confirmed_at IS NOT NULL
  LOOP
    PERFORM public.claim_speaker_profile_for_verified_auth_user(v_user.id, v_user.email);
  END LOOP;
END;
$$;

COMMIT;
