-- ============================================================================
-- V028: Claim preconfigured BSL speaker profiles after verified auth signup
-- ============================================================================
-- Speakers are often imported before they have an account. This keeps their
-- private claim email separate from the public speaker record and safely links
-- it only after Supabase verifies that email through OTP or Google sign-in.
--
-- Event administration is never inferred from being a speaker. An admin must
-- explicitly preconfigure each event-role grant on the claim record.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.speaker_identity_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- bsl_speakers.id is text in BSL development and uuid in production. Keep
  -- this key text and validate it when configured so one portable migration
  -- can serve both environments.
  speaker_id text NOT NULL UNIQUE,
  email_normalized text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'unclaimed'
    CHECK (status IN ('unclaimed', 'claimed', 'needs_review')),
  configured_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  claimed_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  claim_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT speaker_identity_claims_email_normalized_check
    CHECK (email_normalized = lower(btrim(email_normalized))),
  CONSTRAINT speaker_identity_claims_status_consistency_check
    CHECK (
      (status = 'claimed' AND claimed_user_id IS NOT NULL AND claimed_at IS NOT NULL)
      OR (status <> 'claimed' AND claimed_user_id IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS public.speaker_identity_claim_event_roles (
  claim_id uuid NOT NULL REFERENCES public.speaker_identity_claims(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  role public.event_role NOT NULL,
  PRIMARY KEY (claim_id, event_id, role)
);

ALTER TABLE public.speaker_identity_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_identity_claim_event_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_speaker_profile_for_verified_auth_user(
  p_user_id uuid,
  p_email text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim public.speaker_identity_claims%ROWTYPE;
  v_speaker_id text;
  v_email text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF v_email = '' THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_claim
    FROM public.speaker_identity_claims
   WHERE email_normalized = v_email
     AND status = 'unclaimed'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.bsl_speakers
     SET user_id = p_user_id,
         updated_at = now()
   WHERE id::text = v_claim.speaker_id
     AND user_id IS NULL
   RETURNING id::text INTO v_speaker_id;

  IF v_speaker_id IS NULL THEN
    UPDATE public.speaker_identity_claims
       SET status = 'needs_review',
           claim_error = 'Speaker profile is already linked to another account',
           updated_at = now()
     WHERE id = v_claim.id;
    RETURN false;
  END IF;

  UPDATE public.speaker_identity_claims
     SET status = 'claimed',
         claimed_user_id = p_user_id,
         claimed_at = now(),
         claim_error = NULL,
         updated_at = now()
   WHERE id = v_claim.id;

  INSERT INTO public.event_roles (event_id, user_id, role, granted_by, metadata)
  SELECT role_grant.event_id,
         p_user_id,
         role_grant.role,
         v_claim.configured_by,
         jsonb_build_object('source', 'speaker_identity_claim', 'claim_id', v_claim.id)
    FROM public.speaker_identity_claim_event_roles AS role_grant
   WHERE role_grant.claim_id = v_claim.id
  ON CONFLICT (event_id, user_id, role) DO NOTHING;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  SELECT v_claim.configured_by,
         role_grant.event_id,
         'speaker_identity.claimed',
         'speaker',
         v_speaker_id::text,
         jsonb_build_object('claim_id', v_claim.id, 'claimed_user_id', p_user_id, 'role', role_grant.role)
    FROM public.speaker_identity_claim_event_roles AS role_grant
   WHERE role_grant.claim_id = v_claim.id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_speaker_profile_for_verified_auth_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_speaker_profile_for_verified_auth_user(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_speaker_profile_on_verified_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NULL OR (NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL) THEN
    RETURN NEW;
  END IF;

  PERFORM public.claim_speaker_profile_for_verified_auth_user(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_speaker_profile_on_verified_signup ON auth.users;
CREATE TRIGGER trg_claim_speaker_profile_on_verified_signup
  AFTER INSERT OR UPDATE OF email, email_confirmed_at, confirmed_at ON auth.users
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
     AND (email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL)
   LIMIT 1;
  IF FOUND THEN
    PERFORM public.claim_speaker_profile_for_verified_auth_user(v_existing_user.id, v_existing_user.email);
  END IF;

  RETURN jsonb_build_object('claim_id', v_claim_id, 'speaker_id', p_speaker_id, 'status', 'unclaimed');
END;
$$;
REVOKE ALL ON FUNCTION public.configure_speaker_identity_claim(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_speaker_identity_claim(uuid, text, text, jsonb)
  TO service_role;

-- Existing verified accounts should behave exactly like new ones when an
-- administrator later configures a claim. The unique claim state keeps this
-- backfill idempotent.
DO $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN
    SELECT id, email
      FROM auth.users
     WHERE email IS NOT NULL
       AND (email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL)
  LOOP
    PERFORM public.claim_speaker_profile_for_verified_auth_user(v_user.id, v_user.email);
  END LOOP;
END;
$$;

COMMIT;
