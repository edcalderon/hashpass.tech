-- A printed invitation URL is intentionally easy to share. It is therefore
-- an application trigger, not an entitlement credential: verified accounts
-- submit one request, a named Business approver reviews it, and only approval
-- upgrades the BSL and Colombia Blockchain Week passes.
--
-- The trusted approver is stored as an email SHA-256 fingerprint so this
-- migration never publishes a personal operational address. The API resolves
-- the current verified auth user from that fingerprint before in-app/email
-- delivery or an approval decision.

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_invite_approvers (
  email_hash text PRIMARY KEY,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.business_invite_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.business_invite_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id),
  CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_business_invite_requests_review_queue
  ON public.business_invite_requests (status, requested_at ASC);

ALTER TABLE public.business_invite_approvers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invite_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_invite_approvers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.business_invite_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_invite_approvers TO service_role;
GRANT ALL ON public.business_invite_requests TO service_role;

-- Fingerprint of the sole operational Business-review account. A subsequent
-- migration can add reviewers without changing the public invitation flow.
INSERT INTO public.business_invite_approvers (email_hash, label)
VALUES (
  'e2379397b37c63113eb8492347d8aee9f822922c3a0b85a7b9e50c7ee16a79a9',
  'Primary Business review account'
)
ON CONFLICT (email_hash) DO UPDATE SET label = EXCLUDED.label;

CREATE OR REPLACE FUNCTION public.list_business_invite_approver_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT user_record.id
  FROM auth.users AS user_record
  JOIN public.business_invite_approvers AS approver
    ON approver.email_hash = encode(extensions.digest(lower(user_record.email), 'sha256'), 'hex')
  WHERE user_record.email_confirmed_at IS NOT NULL;
$$;

-- The pre-existing default-pass helper historically searches by requested
-- tier. An approved invitation must instead retain any active entitlement
-- (especially VIP) and only create a General pass when this event has none.
-- This local helper also supports the BSL hub event id used by the campaign.
CREATE OR REPLACE FUNCTION public.ensure_business_invite_event_pass(
  p_user_id uuid,
  p_event_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id text;
  v_pass_id uuid;
  v_return_id text;
  v_pass_number text := 'HP-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_pass_number_type text;
BEGIN
  IF p_user_id IS NULL OR NULLIF(btrim(p_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'Business invitation pass identity is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:business-invite-pass:' || p_user_id::text || ':' || p_event_id, 0)
  );

  SELECT pass.id::text INTO v_existing_id
  FROM public.passes AS pass
  WHERE pass.user_id = p_user_id
    AND pass.event_id = p_event_id
    AND pass.status = 'active'
  ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
           pass.created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT data_type INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number';

  v_pass_id := gen_random_uuid();
  BEGIN
    IF v_pass_number_type IN ('text', 'character varying') THEN
      EXECUTE '
        INSERT INTO public.passes (
          id, user_id, event_id, pass_type, status, pass_number,
          max_meeting_requests, used_meeting_requests, max_boost_amount,
          used_boost_amount, access_features, special_perks
        ) VALUES ($1, $2, $3, ''general''::public.pass_type, ''active'', $4,
          10, 0, 100, 0, $5, $6)
        RETURNING id::text'
      INTO v_return_id
      USING v_pass_id, p_user_id, p_event_id, v_pass_number,
        ARRAY['general_sessions'], ARRAY['basic_swag'];
    ELSE
      INSERT INTO public.passes (
        id, user_id, event_id, pass_type, status,
        max_meeting_requests, used_meeting_requests, max_boost_amount,
        used_boost_amount, access_features, special_perks
      ) VALUES (
        v_pass_id, p_user_id, p_event_id, 'general'::public.pass_type, 'active',
        10, 0, 100, 0, ARRAY['general_sessions'], ARRAY['basic_swag']
      )
      RETURNING id::text INTO v_return_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT pass.id::text INTO v_return_id
    FROM public.passes AS pass
    WHERE pass.user_id = p_user_id AND pass.event_id = p_event_id AND pass.status = 'active'
    ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
             pass.created_at DESC
    LIMIT 1;
  END;

  IF v_return_id IS NULL THEN
    RAISE EXCEPTION 'Unable to provision the Business invitation event pass' USING ERRCODE = '22023';
  END IF;
  RETURN v_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_business_invite_for_user(
  p_user_id uuid,
  p_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_campaign public.business_invite_campaigns%ROWTYPE;
  v_request public.business_invite_requests%ROWTYPE;
  v_created boolean := false;
  v_event_ids jsonb;
  v_approver record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to request Business access' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = p_user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email before requesting Business access' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL
    OR length(btrim(p_code)) < 4
    OR length(btrim(p_code)) > 64
    OR upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{3,63}$' THEN
    RAISE EXCEPTION 'Invalid Business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.business_invite_campaigns
  WHERE code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex')
    AND is_active = true
  FOR UPDATE;
  IF NOT FOUND OR (v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired Business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(target.event_id ORDER BY target.event_id)
  INTO v_event_ids
  FROM public.business_invite_campaign_events AS target
  JOIN public.events AS event ON event.id = target.event_id AND event.status = 'published'
  JOIN public.event_pass_tiers AS tier
    ON tier.event_id = target.event_id AND tier.pass_type = 'business'
  WHERE target.campaign_id = v_campaign.id;
  IF v_event_ids IS NULL THEN
    RAISE EXCEPTION 'Business access is not configured for this invitation' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.business_invite_requests (campaign_id, user_id)
  VALUES (v_campaign.id, p_user_id)
  ON CONFLICT (campaign_id, user_id) DO NOTHING
  RETURNING * INTO v_request;

  v_created := FOUND;
  IF NOT v_created THEN
    SELECT * INTO v_request
    FROM public.business_invite_requests
    WHERE campaign_id = v_campaign.id AND user_id = p_user_id
    FOR UPDATE;
  END IF;

  IF v_created THEN
    PERFORM public.create_notification(
      p_user_id,
      'business_invite_pending',
      'Business access pending review',
      'Your Business access request is pending confirmation by HASHPASS.',
      NULL, NULL, false, NULL, 'important'
    );

    FOR v_approver IN
      SELECT user_id FROM public.list_business_invite_approver_user_ids()
    LOOP
      PERFORM public.create_notification(
        v_approver.user_id,
        'business_invite_review_required',
        'Business access approval requested',
        'A verified account requested BSL and Colombia Blockchain Week Business access.',
        NULL, NULL, true, NULL, 'critical'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'status', v_request.status,
    'request_id', v_request.id,
    'created', v_created,
    'event_ids', v_event_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_business_invite_request(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.business_invite_requests%ROWTYPE;
  v_campaign public.business_invite_campaigns%ROWTYPE;
  v_event record;
  v_pass_id text;
  v_primary_pass_id text;
  v_max_requests integer;
  v_max_boost numeric;
  v_pass_ids jsonb := '{}'::jsonb;
  v_has_claim boolean;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid Business invitation decision' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS user_record
    JOIN public.business_invite_approvers AS approver
      ON approver.email_hash = encode(extensions.digest(lower(user_record.email), 'sha256'), 'hex')
    WHERE user_record.id = p_actor_user_id AND user_record.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Business invitation approval is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.business_invite_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business invitation request was not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'request_id', v_request.id,
      'user_id', v_request.user_id,
      'status', v_request.status,
      'already_reviewed', true
    );
  END IF;

  SELECT * INTO v_campaign
  FROM public.business_invite_campaigns
  WHERE id = v_request.campaign_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_campaign.is_active
    OR (v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()) THEN
    RAISE EXCEPTION 'Business invitation campaign is unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.business_invite_requests
    SET status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_user_id, updated_at = now()
    WHERE id = v_request.id;

    PERFORM public.create_notification(
      v_request.user_id,
      'business_invite_rejected',
      'Business access request not approved',
      'Your Business access request was reviewed and was not approved.',
      NULL, NULL, false, NULL, 'important'
    );

    RETURN jsonb_build_object(
      'request_id', v_request.id,
      'user_id', v_request.user_id,
      'status', 'rejected',
      'already_reviewed', false
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_invite_claims
    WHERE campaign_id = v_campaign.id AND user_id = v_request.user_id
  ) INTO v_has_claim;

  IF NOT v_has_claim
    AND v_campaign.max_claims IS NOT NULL
    AND v_campaign.claimed_count >= v_campaign.max_claims THEN
    RAISE EXCEPTION 'This Business invitation has reached its limit' USING ERRCODE = '22023';
  END IF;

  FOR v_event IN
    SELECT target.event_id
    FROM public.business_invite_campaign_events AS target
    JOIN public.events AS event ON event.id = target.event_id
    JOIN public.event_pass_tiers AS tier
      ON tier.event_id = target.event_id AND tier.pass_type = 'business'
    WHERE target.campaign_id = v_campaign.id AND event.status = 'published'
    ORDER BY CASE target.event_id WHEN 'bsl' THEN 0 WHEN 'cbweek2026' THEN 1 ELSE 2 END
  LOOP
    SELECT max_meeting_requests, max_boost_amount
    INTO v_max_requests, v_max_boost
    FROM public.event_pass_tiers
    WHERE event_id = v_event.event_id AND pass_type = 'business';

    v_pass_id := public.ensure_business_invite_event_pass(v_request.user_id, v_event.event_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.passes
      WHERE id::text = v_pass_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'An active event pass is required for this invitation' USING ERRCODE = '22023';
    END IF;

    -- Upgrade in place only; a VIP entitlement and its consumed counters stay intact.
    UPDATE public.passes AS pass
    SET pass_type = 'business'::public.pass_type,
        max_meeting_requests = v_max_requests,
        max_boost_amount = v_max_boost,
        access_features = ARRAY['all_sessions', 'networking', 'business_events'],
        special_perks = ARRAY['business_lounge', 'networking_tools'],
        updated_at = now()
    WHERE pass.id::text = v_pass_id
      AND pass.status = 'active'
      AND CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END <= 1;

    v_primary_pass_id := COALESCE(v_primary_pass_id, v_pass_id);
    v_pass_ids := v_pass_ids || jsonb_build_object(v_event.event_id, v_pass_id);
  END LOOP;

  IF v_primary_pass_id IS NULL THEN
    RAISE EXCEPTION 'Business access is not configured for this invitation' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.business_invite_claims (campaign_id, user_id, pass_id)
  VALUES (v_campaign.id, v_request.user_id, v_primary_pass_id)
  ON CONFLICT (campaign_id, user_id) DO UPDATE
  SET pass_id = EXCLUDED.pass_id, claimed_at = now();

  IF NOT v_has_claim THEN
    UPDATE public.business_invite_campaigns
    SET claimed_count = claimed_count + 1, updated_at = now()
    WHERE id = v_campaign.id;
  END IF;

  UPDATE public.business_invite_requests
  SET status = 'approved', reviewed_at = now(), reviewed_by = p_actor_user_id, updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.user_id,
    'business_invite_approved',
    'Business access approved',
    'Your BSL and Colombia Blockchain Week Business access is now active.',
    NULL, NULL, false, NULL, 'important'
  );

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'user_id', v_request.user_id,
    'status', 'approved',
    'pass_ids', v_pass_ids,
    'already_reviewed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_business_invite_requests_for_approver(
  p_actor_user_id uuid,
  p_status text DEFAULT 'pending',
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid Business invitation status' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid Business invitation page size' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS actor
    JOIN public.business_invite_approvers AS approver
      ON approver.email_hash = encode(extensions.digest(lower(actor.email), 'sha256'), 'hex')
    WHERE actor.id = p_actor_user_id AND actor.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Business invitation approval is not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT request.id, request.user_id, requester.email, request.status,
         request.requested_at, request.reviewed_at, request.reviewed_by
  FROM public.business_invite_requests AS request
  JOIN auth.users AS requester ON requester.id = request.user_id
  WHERE request.status = p_status
  ORDER BY request.requested_at ASC
  LIMIT p_limit;
END;
$$;

-- The legacy automatic RPC must never be callable by a browser role.
REVOKE ALL ON FUNCTION public.claim_business_invite(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_business_invite_approver_user_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_business_invite_event_pass(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_business_invite_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_business_invite_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_business_invite_requests_for_approver(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_business_invite_approver_user_ids() TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_business_invite_event_pass(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_business_invite_for_user(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_business_invite_request(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_business_invite_requests_for_approver(uuid, text, integer) TO service_role;

COMMIT;
