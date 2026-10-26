-- V153: original-ticket exchange review flow and tamper guards.
--
-- * General tickets are approved immediately; Business/VIP claims notify every
--   reviewer (in-app here, email from the API).
-- * A claim can only be created for an event that has not ended.
-- * The identity of a claim (who, which ticket, which event) is immutable and
--   a finished claim cannot be reopened, so a stolen service call cannot move
--   an approved ticket to another account.
-- * edward@hashpass.app is a global administrator.

BEGIN;

-- The constraint is NOT VALID so a legacy row with an older type never blocks
-- the migration; every new row is still checked.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'meeting_request', 'meeting_accepted', 'meeting_declined', 'meeting_reminder',
    'meeting_expired', 'meeting_cancelled', 'meeting_slot_conflict', 'boost_received',
    'system_alert', 'chat_message', 'business_invite_pending',
    'business_invite_review_required', 'business_invite_rejected',
    'business_invite_approved', 'speaker_claim_review_required',
    'speaker_claim_approved', 'speaker_claim_rejected',
    'ticket_claim_review_required'
  ])) NOT VALID;

-- Global administrator: edward@hashpass.app (when the account already exists).
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = 'edward@hashpass.app' LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'edward@hashpass.app has no auth.users row yet; grant super_admin after the first sign-in';
  ELSE
    INSERT INTO public.user_roles (user_id, role, metadata)
    VALUES (v_id, 'super_admin'::public.user_role, jsonb_build_object('source', 'V153'))
    ON CONFLICT (user_id, role) DO UPDATE SET expires_at = NULL;
  END IF;
END;
$$;

-- Same behaviour as V152, plus: new claims need an event that has not ended,
-- and the result says whether this call created the claim.
CREATE OR REPLACE FUNCTION public.submit_external_ticket_claim(
  p_user_id uuid,
  p_event_id text,
  p_issuer text,
  p_ticket_code text,
  p_source_qr_digest text,
  p_source_qr_payload jsonb DEFAULT '{}',
  p_source_ticket_metadata jsonb DEFAULT '{}',
  p_requested_pass_type text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_qr_claim public.external_ticket_claims%ROWTYPE;
  v_code text := upper(btrim(coalesce(p_ticket_code, '')));
  v_hash text;
  v_issuer text := lower(nullif(btrim(coalesce(p_issuer, '')), ''));
  v_digest text := nullif(btrim(coalesce(p_source_qr_digest, '')), '');
  v_event_id text := lower(nullif(btrim(coalesce(p_event_id, '')), ''));
  v_ends_at timestamptz;
BEGIN
  IF p_user_id IS NULL OR v_event_id IS NULL THEN
    RAISE EXCEPTION 'A user and event are required' USING ERRCODE = '22023';
  END IF;
  IF length(v_code) < 4 OR length(v_code) > 128 THEN
    RAISE EXCEPTION 'A valid original ticket code is required' USING ERRCODE = '22023';
  END IF;
  IF v_issuer IS NULL OR v_digest IS NULL THEN
    RAISE EXCEPTION 'The original ticket issuer and QR proof are required' USING ERRCODE = '22023';
  END IF;
  IF p_requested_pass_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'Unsupported requested pass type' USING ERRCODE = '22023';
  END IF;

  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

  SELECT * INTO v_claim
  FROM public.external_ticket_claims
  WHERE issuer = v_issuer
    AND event_id = v_event_id
    AND ticket_code_hash = v_hash
    AND revoked_at IS NULL
  FOR UPDATE;
  IF FOUND THEN
    IF v_claim.claimant_user_id <> p_user_id THEN
      RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
    END IF;

    IF v_digest NOT LIKE 'manual:%'
       AND v_claim.source_qr_digest IS DISTINCT FROM v_digest THEN
      SELECT * INTO v_qr_claim
      FROM public.external_ticket_claims
      WHERE source_qr_digest = v_digest
        AND revoked_at IS NULL
        AND id <> v_claim.id
      FOR UPDATE;
      IF FOUND THEN
        RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
      END IF;

      IF v_claim.status = 'pending' AND v_claim.source_qr_digest LIKE 'manual:%' THEN
        UPDATE public.external_ticket_claims
        SET source_qr_digest = v_digest,
            source_qr_payload = coalesce(p_source_qr_payload, '{}'::jsonb)
        WHERE id = v_claim.id
        RETURNING * INTO v_claim;
      ELSE
        RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
      END IF;
    END IF;

    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id, 'created', false);
  END IF;

  SELECT * INTO v_qr_claim
  FROM public.external_ticket_claims
  WHERE source_qr_digest = v_digest
    AND revoked_at IS NULL
  FOR UPDATE;
  IF FOUND THEN
    IF v_qr_claim.claimant_user_id <> p_user_id THEN
      RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_qr_claim.id, 'status', v_qr_claim.status, 'pass_id', v_qr_claim.hashpass_pass_id, 'created', false);
  END IF;

  -- Only a new claim needs an upcoming event; retries above stay idempotent.
  SELECT ends_at INTO v_ends_at FROM public.events WHERE id = v_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This event is not open for ticket exchange' USING ERRCODE = '22023';
  END IF;
  IF v_ends_at IS NOT NULL AND v_ends_at < now() THEN
    RAISE EXCEPTION 'This event has already taken place' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.external_ticket_claims (
    event_id, issuer, claimant_user_id, ticket_code_hash, ticket_code_last4,
    source_qr_digest, source_qr_payload, source_ticket_metadata, requested_pass_type
  ) VALUES (
    v_event_id, v_issuer, p_user_id, v_hash, right(v_code, 4),
    v_digest, coalesce(p_source_qr_payload, '{}'::jsonb), coalesce(p_source_ticket_metadata, '{}'::jsonb),
    p_requested_pass_type
  ) RETURNING * INTO v_claim;

  RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', NULL, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_external_ticket_claim(uuid, text, text, text, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_external_ticket_claim(uuid, text, text, text, text, jsonb, jsonb, text)
  TO service_role;

-- General tickets are approved on the spot by the highest-ranked active
-- administrator, which keeps the existing audit trail (reviewer + note).
CREATE OR REPLACE FUNCTION public.auto_approve_external_ticket_claim(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_actor uuid;
BEGIN
  SELECT * INTO v_claim FROM public.external_ticket_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket claim not found' USING ERRCODE = '22023';
  END IF;
  IF v_claim.requested_pass_type <> 'general' THEN
    RAISE EXCEPTION 'Only general tickets are approved automatically' USING ERRCODE = '42501';
  END IF;
  IF v_claim.status <> 'pending' OR v_claim.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id);
  END IF;

  SELECT ur.user_id INTO v_actor
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
    AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ORDER BY (ur.role = 'super_admin'::public.user_role) DESC, ur.granted_at NULLS LAST
  LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No administrator is available to approve this ticket' USING ERRCODE = '22023';
  END IF;

  RETURN public.review_external_ticket_claim(
    p_claim_id, v_actor, 'approve', 'general', 'Auto-approved: general original ticket'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_approve_external_ticket_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_external_ticket_claim(uuid) TO service_role;

-- In-app approval request for every event and global administrator. Returns
-- the notified ids so the API can see whether anyone was reachable.
CREATE OR REPLACE FUNCTION public.notify_ticket_claim_reviewers(p_claim_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_email text;
  v_message text;
  v_ids uuid[];
  v_id uuid;
  v_notified uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO v_claim FROM public.external_ticket_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN v_notified; END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_claim.claimant_user_id;
  v_message := left(format(
    '%s requests a %s pass for %s with original ticket ••••%s (%s)%s.',
    coalesce(v_email, 'A member'),
    upper(v_claim.requested_pass_type),
    v_claim.event_id,
    v_claim.ticket_code_last4,
    v_claim.issuer,
    CASE WHEN nullif(v_claim.source_ticket_metadata ->> 'holder', '') IS NULL THEN ''
         ELSE ', name on ticket: ' || (v_claim.source_ticket_metadata ->> 'holder') END
  ), 500);

  SELECT coalesce(array_agg(DISTINCT reviewer.user_id), ARRAY[]::uuid[]) INTO v_ids
  FROM (
    SELECT er.user_id
    FROM public.event_roles er
    WHERE er.role = 'event_admin'::public.event_role
      AND (er.expires_at IS NULL OR er.expires_at > now())
      AND (
        er.event_id = v_claim.event_id
        OR EXISTS (
          SELECT 1 FROM public.events target_event
          WHERE target_event.id = v_claim.event_id
            AND target_event.metadata ->> 'hubEventId' = er.event_id
        )
      )
    UNION
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) reviewer;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.create_notification(
        v_id, 'ticket_claim_review_required', 'HASHPASS pass approval request',
        v_message, NULL::uuid, NULL::text, false, NULL::uuid, 'important'
      );
      v_notified := v_notified || v_id;
    EXCEPTION WHEN OTHERS THEN
      -- One unreachable reviewer must not hide the request from the others.
      RAISE WARNING 'ticket claim notification failed for %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_ticket_claim_reviewers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_ticket_claim_reviewers(uuid) TO service_role;

-- Tamper guard: a claim's identity never changes, and a finished claim cannot
-- be reopened. The only legal moves after conversion are the revocation that
-- resolve_external_ticket_report performs, and attaching a real QR proof to a
-- manual claim (V151/V152).
CREATE OR REPLACE FUNCTION public.guard_external_ticket_claim_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.claimant_user_id IS DISTINCT FROM OLD.claimant_user_id
     OR NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.issuer IS DISTINCT FROM OLD.issuer
     OR NEW.ticket_code_hash IS DISTINCT FROM OLD.ticket_code_hash
     OR NEW.requested_pass_type IS DISTINCT FROM OLD.requested_pass_type THEN
    RAISE EXCEPTION 'An original ticket claim cannot be reassigned' USING ERRCODE = '42501';
  END IF;
  IF NEW.source_qr_digest IS DISTINCT FROM OLD.source_qr_digest
     AND OLD.source_qr_digest NOT LIKE 'manual:%' THEN
    RAISE EXCEPTION 'The QR proof of a claim cannot be replaced' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IN ('rejected', 'converted')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'converted' AND NEW.status = 'rejected' AND NEW.revoked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'A finished ticket claim cannot be reopened' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS external_ticket_claim_guard ON public.external_ticket_claims;
CREATE TRIGGER external_ticket_claim_guard
  BEFORE UPDATE ON public.external_ticket_claims
  FOR EACH ROW EXECUTE FUNCTION public.guard_external_ticket_claim_update();

COMMIT;
