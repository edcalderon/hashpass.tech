-- ============================================================================
-- V115: Repair the deployed speaker claim review policy
-- ============================================================================
-- V111 was already applied in some BSL tenants before its review function was
-- corrected. Recreate that function here so existing databases authorize with
-- the supplied actor id and keep claimed speakers meeting-eligible.
-- ============================================================================

BEGIN;

UPDATE public.bsl_speakers
   SET directory_visible = true,
       is_active = true,
       is_accepting_meetings = true,
       updated_at = now()
 WHERE (event_id = 'colombia2026' AND metadata ->> 'source' = 'blockchainsummit-colombia2026')
    OR (event_id = 'bsl2025' AND metadata ->> 'source' = 'packages/config/src/events.ts');

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
      SELECT 1 FROM public.bsl_speakers
       WHERE user_id = v_claim.requester_user_id
         AND id::text <> v_claim.speaker_id
    ) THEN
      RAISE EXCEPTION 'This account is already linked to another speaker profile'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.speaker_identity_claims
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
      speaker_id, email_normalized, status, configured_by,
      claimed_user_id, claimed_at, metadata
    ) VALUES (
      v_claim.speaker_id, v_email, 'claimed', p_actor_user_id,
      v_claim.requester_user_id, now(),
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
