-- ============================================================================
-- V111: Publish imported speaker profiles without granting account access
-- ============================================================================
-- A directory profile is public content. Networking availability is a separate
-- capability that requires a verified account linked to the exact profile.
-- This migration also adds an event-admin-reviewed claim workflow for speakers
-- whose email addresses were not available during programme ingestion.
-- ============================================================================

BEGIN;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS directory_visible boolean NOT NULL DEFAULT false;

-- Colombia's imported programme is intended to be publicly discoverable even
-- before speakers claim their profiles. No account or email is assigned here.
UPDATE public.bsl_speakers
   SET directory_visible = true,
       updated_at = now()
 WHERE event_id = 'colombia2026';

-- Preserve the current public behaviour for existing active records in other
-- events while keeping the new visibility flag independent going forward.
UPDATE public.bsl_speakers
   SET directory_visible = true,
       updated_at = now()
 WHERE COALESCE(is_active, false)
   AND directory_visible = false;

CREATE TABLE IF NOT EXISTS public.speaker_claim_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id text NOT NULL,
  event_id text NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  request_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS speaker_claim_requests_pending_unique
  ON public.speaker_claim_requests (speaker_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS speaker_claim_requests_event_status_idx
  ON public.speaker_claim_requests (event_id, status, created_at DESC);

ALTER TABLE public.speaker_claim_requests ENABLE ROW LEVEL SECURITY;

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
     AND directory_visible = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker profile is not available for claiming'
      USING ERRCODE = '22023';
  END IF;

  IF v_speaker.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Speaker profile is already linked to an account'
      USING ERRCODE = '23505';
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

CREATE OR REPLACE FUNCTION public.list_speaker_claim_requests(
  p_actor_user_id uuid,
  p_event_id text
) RETURNS TABLE (
  claim_id uuid,
  speaker_id text,
  event_id text,
  speaker_name text,
  speaker_title text,
  speaker_company text,
  requester_user_id uuid,
  requester_email text,
  status text,
  request_note text,
  created_at timestamptz,
  review_note text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may review speaker claims'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT request.id,
         request.speaker_id,
         request.event_id,
         speaker.name,
         speaker.title,
         speaker.company,
         request.requester_user_id,
         lower(auth_user.email),
         request.status,
         request.request_note,
         request.created_at,
         request.review_note
    FROM public.speaker_claim_requests AS request
    JOIN public.bsl_speakers AS speaker
      ON speaker.id::text = request.speaker_id
     AND speaker.event_id = request.event_id
    JOIN auth.users AS auth_user
      ON auth_user.id = request.requester_user_id
   WHERE request.event_id = p_event_id
   ORDER BY request.created_at DESC
   LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.list_speaker_claim_requests(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_speaker_claim_requests(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.review_speaker_profile_claim(
  p_actor_user_id uuid,
  p_claim_id uuid,
  p_action text,
  p_review_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_claim public.speaker_claim_requests%ROWTYPE;
  v_speaker public.bsl_speakers%ROWTYPE;
  v_email text;
BEGIN
  SELECT *
    INTO v_claim
    FROM public.speaker_claim_requests
   WHERE id = p_claim_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker claim request not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_event_admin_access(p_actor_user_id, v_claim.event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may review speaker claims'
      USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unsupported speaker claim review action' USING ERRCODE = '22023';
  END IF;
  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'This speaker claim has already been reviewed' USING ERRCODE = '23505';
  END IF;

  SELECT *
    INTO v_speaker
    FROM public.bsl_speakers
   WHERE id::text = v_claim.speaker_id
     AND event_id = v_claim.event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker profile not found for this event' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'approve' THEN
    SELECT lower(email)
      INTO v_email
      FROM auth.users
     WHERE id = v_claim.requester_user_id
       AND email IS NOT NULL
       AND email_confirmed_at IS NOT NULL;
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'The claimant must have a confirmed email before approval'
        USING ERRCODE = '42501';
    END IF;
    IF v_speaker.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Speaker profile is already linked to an account'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.bsl_speakers
       WHERE user_id = v_claim.requester_user_id
         AND id::text <> v_claim.speaker_id
    ) THEN
      RAISE EXCEPTION 'This account is already linked to another speaker profile'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.speaker_identity_claims
       WHERE (claimed_user_id = v_claim.requester_user_id OR email_normalized = v_email)
         AND speaker_id <> v_claim.speaker_id
    ) THEN
      RAISE EXCEPTION 'This account or email is already linked to another speaker profile'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.bsl_speakers
       SET user_id = v_claim.requester_user_id,
           is_active = true,
           is_accepting_meetings = true,
           directory_visible = true,
           updated_at = now()
     WHERE id::text = v_claim.speaker_id
       AND event_id = v_claim.event_id;

    INSERT INTO public.speaker_identity_claims (
      speaker_id,
      email_normalized,
      status,
      configured_by,
      claimed_user_id,
      claimed_at,
      metadata
    ) VALUES (
      v_claim.speaker_id,
      v_email,
      'claimed',
      p_actor_user_id,
      v_claim.requester_user_id,
      now(),
      jsonb_build_object('source', 'speaker_claim_request', 'claim_request_id', v_claim.id)
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

  UPDATE public.speaker_claim_requests
     SET status = p_action,
         reviewed_by = p_actor_user_id,
         review_note = NULLIF(left(btrim(COALESCE(p_review_note, '')), 1000), ''),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = v_claim.id;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    v_claim.event_id,
    'speaker_claim.' || p_action,
    'speaker',
    v_claim.speaker_id,
    jsonb_build_object('claim_id', v_claim.id, 'requester_user_id', v_claim.requester_user_id)
  );

  RETURN jsonb_build_object(
    'claim_id', v_claim.id,
    'speaker_id', v_claim.speaker_id,
    'status', p_action
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_speaker_profile_claim(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_speaker_profile_claim(uuid, uuid, text, text)
  TO service_role;

COMMIT;
