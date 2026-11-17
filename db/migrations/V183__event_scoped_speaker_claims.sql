-- ============================================================================
-- V183: Speaker-profile claims for event-scoped speakers (public.speakers)
-- ============================================================================
-- V132 resolved speakers only through public.bsl_speakers, so event-scoped
-- profiles such as the 17 official Colombia Blockchain Week 2026 speakers
-- (V181) could not be claimed. Each claim function now falls back to
-- public.speakers within the claim's own event. Behaviour for bsl_speakers
-- profiles is unchanged.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_speaker_claim_reviewers(p_claim_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_claim public.speaker_claim_requests%ROWTYPE;
  v_speaker_name text;
  v_email text;
  v_message text;
  v_ids uuid[];
  v_id uuid;
BEGIN
  SELECT * INTO v_claim FROM public.speaker_claim_requests WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN ARRAY[]::uuid[]; END IF;

  SELECT name INTO v_speaker_name FROM public.bsl_speakers WHERE id::text = v_claim.speaker_id;
  IF v_speaker_name IS NULL THEN
    SELECT name INTO v_speaker_name
      FROM public.speakers
     WHERE id::text = v_claim.speaker_id AND event_id = v_claim.event_id;
  END IF;
  v_email := COALESCE(v_claim.claim_email, (SELECT lower(email) FROM auth.users WHERE id = v_claim.requester_user_id));
  v_message := left(format(
    '%s asks to link %s to %s%s. Note: %s',
    COALESCE(v_email, 'A verified account'),
    COALESCE(v_speaker_name, 'a speaker profile'),
    CASE v_claim.claim_mode WHEN 'other_email' THEN 'a different email (verified)' ELSE 'their signed-in email' END,
    '',
    COALESCE(v_claim.request_note, '-')
  ), 500);

  v_ids := public.speaker_claim_reviewer_ids(v_claim.event_id);
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM public.create_notification(
      v_id, 'speaker_claim_review_required', 'Speaker profile claim to review',
      v_message, NULL::uuid, v_claim.speaker_id, false, NULL::uuid, 'important'
    );
  END LOOP;
  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_speaker_profile_claim(
  p_speaker_id text,
  p_submitted_by uuid,
  p_claimant_user_id uuid,
  p_claim_mode text,
  p_claim_email text,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_speaker_id text;
  v_speaker_event_id text;
  v_speaker_name text;
  v_is_event_speaker boolean := false;
  v_existing public.speaker_claim_requests%ROWTYPE;
  v_claim public.speaker_claim_requests%ROWTYPE;
  v_email text;
  v_confirmed timestamptz;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 1000), '');
  v_reviewers uuid[] := ARRAY[]::uuid[];
  v_created boolean := true;
BEGIN
  IF p_claim_mode NOT IN ('current_email', 'other_email') THEN
    RAISE EXCEPTION 'Unsupported claim mode' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 20 THEN
    RAISE EXCEPTION 'Explain why this email and account belong to the speaker (at least 20 characters)'
      USING ERRCODE = '22023';
  END IF;

  SELECT lower(email), email_confirmed_at
    INTO v_email, v_confirmed
    FROM auth.users
   WHERE id = p_claimant_user_id AND email IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'The claimant account was not found' USING ERRCODE = '42501';
  END IF;

  IF p_claim_mode = 'current_email' THEN
    IF v_confirmed IS NULL THEN
      RAISE EXCEPTION 'A confirmed email is required to request a speaker profile claim'
        USING ERRCODE = '42501';
    END IF;
  ELSIF v_email IS DISTINCT FROM lower(btrim(COALESCE(p_claim_email, ''))) THEN
    RAISE EXCEPTION 'The claim email does not match the claimant account' USING ERRCODE = '22023';
  END IF;

  SELECT id::text, event_id, name
    INTO v_speaker_id, v_speaker_event_id, v_speaker_name
    FROM public.bsl_speakers
   WHERE id::text = btrim(COALESCE(p_speaker_id, ''))
     AND user_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Event-scoped directory (public.speakers), e.g. Colombia Blockchain Week.
    SELECT id::text, event_id, name
      INTO v_speaker_id, v_speaker_event_id, v_speaker_name
      FROM public.speakers
     WHERE id::text = btrim(COALESCE(p_speaker_id, ''))
       AND user_id IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Speaker profile is not available for claiming' USING ERRCODE = '22023';
    END IF;
    v_is_event_speaker := true;
  END IF;

  IF v_is_event_speaker THEN
    -- One profile per account per event; the same person may speak at several events.
    IF EXISTS (
      SELECT 1 FROM public.speakers
       WHERE user_id = p_claimant_user_id AND event_id = v_speaker_event_id
    ) THEN
      RAISE EXCEPTION 'This account is already linked to a speaker profile' USING ERRCODE = '23505';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.bsl_speakers WHERE user_id = p_claimant_user_id) THEN
    RAISE EXCEPTION 'This account is already linked to a speaker profile' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_existing
    FROM public.speaker_claim_requests
   WHERE speaker_id = v_speaker_id AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.requester_user_id = p_claimant_user_id THEN
      RETURN jsonb_build_object(
        'claim_id', v_existing.id, 'speaker_id', v_existing.speaker_id,
        'status', v_existing.status, 'claim_mode', v_existing.claim_mode,
        'verification_status', v_existing.verification_status,
        'speaker_name', v_speaker_name, 'claim_email', v_existing.claim_email,
        'created', false, 'reviewer_ids', '[]'::jsonb
      );
    ELSIF v_existing.verification_status = 'pending' THEN
      -- An unverified claim must not be able to block the real speaker.
      UPDATE public.speaker_claim_requests
         SET status = 'rejected',
             review_note = 'Superseded by a newer claim request',
             reviewed_at = now(), updated_at = now()
       WHERE id = v_existing.id;
    ELSE
      RETURN jsonb_build_object(
        'claim_id', v_existing.id, 'speaker_id', v_existing.speaker_id,
        'status', v_existing.status, 'claim_mode', v_existing.claim_mode,
        'verification_status', v_existing.verification_status,
        'speaker_name', v_speaker_name, 'claim_email', NULL::text,
        'created', false, 'reviewer_ids', '[]'::jsonb
      );
    END IF;
  END IF;

  INSERT INTO public.speaker_claim_requests (
    speaker_id, event_id, requester_user_id, request_note,
    claim_mode, claim_email, verification_status, submitted_by
  ) VALUES (
    v_speaker_id, v_speaker_event_id, p_claimant_user_id, v_note,
    p_claim_mode, v_email,
    CASE p_claim_mode WHEN 'other_email' THEN 'pending' ELSE 'not_required' END,
    COALESCE(p_submitted_by, p_claimant_user_id)
  )
  RETURNING * INTO v_claim;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    COALESCE(p_submitted_by, p_claimant_user_id), v_speaker_event_id,
    'speaker_claim.requested', 'speaker', v_speaker_id,
    jsonb_build_object('claim_id', v_claim.id, 'claim_mode', p_claim_mode)
  );

  IF p_claim_mode = 'current_email' THEN
    v_reviewers := public.notify_speaker_claim_reviewers(v_claim.id);
  END IF;

  RETURN jsonb_build_object(
    'claim_id', v_claim.id, 'speaker_id', v_claim.speaker_id,
    'status', v_claim.status, 'claim_mode', v_claim.claim_mode,
    'verification_status', v_claim.verification_status,
    'speaker_name', v_speaker_name, 'claim_email', v_claim.claim_email,
    'request_note', v_claim.request_note,
    'created', v_created, 'reviewer_ids', to_jsonb(v_reviewers)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_speaker_claim_email(
  p_speaker_id text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_claim public.speaker_claim_requests%ROWTYPE;
  v_email text;
  v_confirmed timestamptz;
  v_name text;
  v_reviewers uuid[] := ARRAY[]::uuid[];
  v_created boolean := false;
BEGIN
  SELECT * INTO v_claim
    FROM public.speaker_claim_requests
   WHERE speaker_id = btrim(COALESCE(p_speaker_id, ''))
     AND requester_user_id = p_user_id
     AND claim_mode = 'other_email'
     AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending claim is waiting for this email' USING ERRCODE = '22023';
  END IF;

  SELECT lower(email), email_confirmed_at INTO v_email, v_confirmed
    FROM auth.users WHERE id = p_user_id;
  IF v_confirmed IS NULL OR v_email IS DISTINCT FROM v_claim.claim_email THEN
    RAISE EXCEPTION 'This email has not been verified yet' USING ERRCODE = '42501';
  END IF;

  IF v_claim.verification_status <> 'verified' THEN
    UPDATE public.speaker_claim_requests
       SET verification_status = 'verified', verified_at = now(), updated_at = now()
     WHERE id = v_claim.id
    RETURNING * INTO v_claim;
    v_reviewers := public.notify_speaker_claim_reviewers(v_claim.id);
    v_created := true;
  END IF;

  SELECT name INTO v_name FROM public.bsl_speakers WHERE id::text = v_claim.speaker_id;
  IF v_name IS NULL THEN
    SELECT name INTO v_name
      FROM public.speakers
     WHERE id::text = v_claim.speaker_id AND event_id = v_claim.event_id;
  END IF;
  RETURN jsonb_build_object(
    'claim_id', v_claim.id, 'speaker_id', v_claim.speaker_id,
    'status', v_claim.status, 'claim_mode', v_claim.claim_mode,
    'verification_status', v_claim.verification_status,
    'speaker_name', v_name, 'claim_email', v_claim.claim_email,
    'request_note', v_claim.request_note,
    'created', v_created, 'reviewer_ids', to_jsonb(v_reviewers)
  );
END;
$$;

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
  review_note text,
  claim_mode text,
  claim_email text,
  verification_status text,
  submitted_by_email text
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
  SELECT request.id, request.speaker_id, request.event_id,
         COALESCE(speaker.name, event_speaker.name),
         COALESCE(speaker.title, event_speaker.title),
         COALESCE(speaker.company, event_speaker.company),
         request.requester_user_id, lower(auth_user.email),
         request.status, request.request_note, request.created_at, request.review_note,
         request.claim_mode, request.claim_email, request.verification_status,
         lower(submitter.email)
    FROM public.speaker_claim_requests AS request
    LEFT JOIN public.bsl_speakers AS speaker
      ON speaker.id::text = request.speaker_id AND speaker.event_id = request.event_id
    LEFT JOIN public.speakers AS event_speaker
      ON event_speaker.id::text = request.speaker_id AND event_speaker.event_id = request.event_id
    JOIN auth.users AS auth_user ON auth_user.id = request.requester_user_id
    LEFT JOIN auth.users AS submitter ON submitter.id = request.submitted_by
   WHERE request.event_id = p_event_id
     AND (speaker.id IS NOT NULL OR event_speaker.id IS NOT NULL)
   ORDER BY request.created_at DESC
   LIMIT 200;
END;
$$;

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
  v_speaker_name text;
  v_speaker_user_id uuid;
  v_is_event_speaker boolean := false;
  v_email text;
  v_note text := NULLIF(left(btrim(COALESCE(p_review_note, '')), 1000), '');
BEGIN
  SELECT * INTO v_claim FROM public.speaker_claim_requests WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker claim request not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_event_admin_access(p_actor_user_id, v_claim.event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may review speaker claims' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unsupported speaker claim review action' USING ERRCODE = '22023';
  END IF;
  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'This speaker claim has already been reviewed' USING ERRCODE = '23505';
  END IF;

  SELECT name, user_id INTO v_speaker_name, v_speaker_user_id
    FROM public.bsl_speakers
   WHERE id::text = v_claim.speaker_id AND event_id = v_claim.event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    SELECT name, user_id INTO v_speaker_name, v_speaker_user_id
      FROM public.speakers
     WHERE id::text = v_claim.speaker_id AND event_id = v_claim.event_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Speaker profile not found for this event' USING ERRCODE = '22023';
    END IF;
    v_is_event_speaker := true;
  END IF;

  IF p_action = 'approve' THEN
    IF v_claim.claim_mode = 'other_email' AND v_claim.verification_status <> 'verified' THEN
      RAISE EXCEPTION 'The claimant has not verified the email yet' USING ERRCODE = '42501';
    END IF;
    SELECT lower(email) INTO v_email
      FROM auth.users
     WHERE id = v_claim.requester_user_id
       AND email IS NOT NULL AND email_confirmed_at IS NOT NULL;
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'The claimant must have a confirmed email before approval' USING ERRCODE = '42501';
    END IF;
    IF v_speaker_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Speaker profile is already linked to an account' USING ERRCODE = '23505';
    END IF;
    IF v_is_event_speaker THEN
      IF EXISTS (
        SELECT 1 FROM public.speakers
         WHERE user_id = v_claim.requester_user_id
           AND event_id = v_claim.event_id AND id::text <> v_claim.speaker_id
      ) THEN
        RAISE EXCEPTION 'This account is already linked to another speaker profile' USING ERRCODE = '23505';
      END IF;

      -- speaker_identity_claims is unique per email and per account across all
      -- events, so it is not used for event-scoped profiles: that would block
      -- anyone who also speaks at another event. The link lives on the profile.
      UPDATE public.speakers
         SET user_id = v_claim.requester_user_id,
             metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'is_active', true, 'is_accepting_meetings', true, 'directory_visible', true,
               'claimed_via', 'speaker_claim_request', 'claim_request_id', v_claim.id
             ),
             updated_at = now()
       WHERE id::text = v_claim.speaker_id AND event_id = v_claim.event_id;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.bsl_speakers
         WHERE user_id = v_claim.requester_user_id AND id::text <> v_claim.speaker_id
      ) THEN
        RAISE EXCEPTION 'This account is already linked to another speaker profile' USING ERRCODE = '23505';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.speaker_identity_claims
         WHERE (claimed_user_id = v_claim.requester_user_id OR email_normalized = v_email)
           AND speaker_id <> v_claim.speaker_id
      ) THEN
        RAISE EXCEPTION 'This account or email is already linked to another speaker profile' USING ERRCODE = '23505';
      END IF;

      UPDATE public.bsl_speakers
         SET user_id = v_claim.requester_user_id,
             is_active = true, is_accepting_meetings = true, directory_visible = true,
             updated_at = now()
       WHERE id::text = v_claim.speaker_id AND event_id = v_claim.event_id;

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
  END IF;

  UPDATE public.speaker_claim_requests
     SET status = CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_by = p_actor_user_id, review_note = v_note,
         reviewed_at = now(), updated_at = now()
   WHERE id = v_claim.id;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id, v_claim.event_id, 'speaker_claim.' || p_action, 'speaker', v_claim.speaker_id,
    jsonb_build_object('claim_id', v_claim.id, 'requester_user_id', v_claim.requester_user_id)
  );

  PERFORM public.create_notification(
    v_claim.requester_user_id,
    CASE p_action WHEN 'approve' THEN 'speaker_claim_approved' ELSE 'speaker_claim_rejected' END,
    CASE p_action WHEN 'approve' THEN 'Speaker profile linked' ELSE 'Speaker profile claim declined' END,
    left(CASE p_action
      WHEN 'approve' THEN format('%s is now linked to your account.', v_speaker_name)
      ELSE format('Your claim for %s was not approved.%s', v_speaker_name, COALESCE(' Reviewer note: ' || v_note, ''))
    END, 500),
    NULL::uuid, v_claim.speaker_id, false, NULL::uuid, 'important'
  );

  RETURN jsonb_build_object(
    'claim_id', v_claim.id, 'speaker_id', v_claim.speaker_id,
    'status', CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
    'requester_user_id', v_claim.requester_user_id,
    'speaker_name', v_speaker_name, 'claim_mode', v_claim.claim_mode,
    'review_note', v_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_speaker_claim_reviewers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_speaker_claim_reviewers(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.submit_speaker_profile_claim(text, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_speaker_profile_claim(text, uuid, uuid, text, text, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.verify_speaker_claim_email(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_speaker_claim_email(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.list_speaker_claim_requests(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_speaker_claim_requests(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.review_speaker_profile_claim(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_speaker_profile_claim(uuid, uuid, text, text)
  TO service_role;

COMMIT;
