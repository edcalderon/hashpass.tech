-- V147: make pass transfers and external-ticket approvals safe when an
-- entitlement already exists for the recipient or claimant.

BEGIN;

CREATE OR REPLACE FUNCTION public.review_external_ticket_claim(
  p_claim_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_pass_type text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_pass jsonb;
  v_pass_id text;
  v_existing_pass_id text;
  v_existing_pass_type text;
  v_type text := lower(nullif(btrim(coalesce(p_pass_type, '')), ''));
BEGIN
  SELECT * INTO v_claim FROM public.external_ticket_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket claim not found' USING ERRCODE = '22023'; END IF;
  IF v_claim.status IN ('rejected', 'converted') THEN
    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id);
  END IF;
  IF p_action = 'reject' THEN
    UPDATE public.external_ticket_claims
    SET status = 'rejected', reviewer_user_id = p_actor_user_id, reviewer_note = p_note, reviewed_at = now()
    WHERE id = v_claim.id;
    RETURN jsonb_build_object('id', v_claim.id, 'status', 'rejected', 'pass_id', NULL);
  END IF;
  IF p_action <> 'approve' THEN
    RAISE EXCEPTION 'Unsupported claim review action' USING ERRCODE = '22023';
  END IF;
  v_type := coalesce(v_type, v_claim.requested_pass_type);
  IF v_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'A valid pass type is required' USING ERRCODE = '22023';
  END IF;

  -- A claim started from a wallet card already has an event pass. Lock it and
  -- upgrade that entitlement so consumed meeting/boost usage remains intact.
  SELECT id::text, pass_type::text INTO v_existing_pass_id, v_existing_pass_type
  FROM public.passes
  WHERE user_id::text = v_claim.claimant_user_id::text
    AND event_id = v_claim.event_id
  FOR UPDATE;

  -- A repeated or delayed review must never downgrade the claimant.
  IF v_existing_pass_type = 'vip'
    OR (v_existing_pass_type = 'business' AND v_type = 'general') THEN
    v_type := v_existing_pass_type;
  END IF;

  IF v_existing_pass_id IS NULL THEN
    BEGIN
      SELECT public.admin_mutate_event_pass(
        p_actor_user_id, v_claim.event_id, 'create', v_claim.claimant_user_id, NULL, v_type, NULL
      ) INTO v_pass;
    EXCEPTION WHEN unique_violation THEN
      -- A parallel provisioner can create the event pass after the lookup.
      -- Re-read it under lock and apply the claim as an update instead.
      SELECT id::text, pass_type::text INTO v_existing_pass_id, v_existing_pass_type
      FROM public.passes
      WHERE user_id::text = v_claim.claimant_user_id::text
        AND event_id = v_claim.event_id
      FOR UPDATE;
      IF NOT FOUND THEN RAISE; END IF;
      IF v_existing_pass_type = 'vip'
        OR (v_existing_pass_type = 'business' AND v_type = 'general') THEN
        v_type := v_existing_pass_type;
      END IF;
      SELECT public.admin_mutate_event_pass(
        p_actor_user_id, v_claim.event_id, 'update', v_claim.claimant_user_id, v_existing_pass_id, v_type, NULL
      ) INTO v_pass;
    END;
  ELSE
    SELECT public.admin_mutate_event_pass(
      p_actor_user_id, v_claim.event_id, 'update', v_claim.claimant_user_id, v_existing_pass_id, v_type, NULL
    ) INTO v_pass;
  END IF;

  v_pass_id := v_pass->>'id';
  IF nullif(v_pass_id, '') IS NULL THEN
    RAISE EXCEPTION 'Unable to create or update the HashPass equivalent pass' USING ERRCODE = '22023';
  END IF;

  UPDATE public.passes
  SET source_external_ticket_claim_id = v_claim.id,
      source_external_ticket_metadata = v_claim.source_ticket_metadata,
      updated_at = now()
  WHERE id::text = v_pass_id;

  UPDATE public.external_ticket_claims
  SET status = 'converted', reviewer_user_id = p_actor_user_id, reviewer_note = p_note,
      reviewed_at = now(), converted_at = now(), hashpass_pass_id = v_pass_id
  WHERE id = v_claim.id;

  RETURN jsonb_build_object('id', v_claim.id, 'status', 'converted', 'pass_id', v_pass_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_external_ticket_claim(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_external_ticket_claim(uuid, uuid, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_pass_transfer(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  transfer_row public.pass_transfer_requests%ROWTYPE;
  pass_user text;
  recipient_pass_id text;
BEGIN
  SELECT * INTO transfer_row
  FROM public.pass_transfer_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR transfer_row.status <> 'pending' THEN
    RETURN false;
  END IF;

  IF transfer_row.expires_at <= now() THEN
    UPDATE public.pass_transfer_requests
    SET status = 'expired', updated_at = now()
    WHERE id = transfer_row.id;
    RETURN false;
  END IF;

  IF transfer_row.sender_confirmed_at IS NULL OR transfer_row.recipient_confirmed_at IS NULL THEN
    RETURN false;
  END IF;

  -- The request route checks this before sending confirmation emails. This
  -- locked recheck covers entitlements created after that preflight check.
  SELECT id::text INTO recipient_pass_id
  FROM public.passes
  WHERE user_id::text = transfer_row.recipient_user_id
    AND event_id = transfer_row.event_id
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.pass_transfer_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = transfer_row.id;
    RETURN false;
  END IF;

  SELECT user_id::text INTO pass_user
  FROM public.passes
  WHERE id::text = transfer_row.pass_id
    AND event_id = transfer_row.event_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND OR pass_user <> transfer_row.sender_user_id THEN
    RETURN false;
  END IF;

  BEGIN
    UPDATE public.passes
    SET user_id = transfer_row.recipient_user_id
    WHERE id::text = transfer_row.pass_id;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent pass provision can win after the recheck. Do not surface a
    -- 503 to the confirmer or leave a pending transfer behind.
    UPDATE public.pass_transfer_requests
    SET status = 'cancelled', updated_at = now()
    WHERE id = transfer_row.id;
    RETURN false;
  END;

  -- Existing QR codes authorize the prior owner. Revoking them in this
  -- transaction prevents a saved image from admitting the transferred pass.
  UPDATE public.qr_codes
  SET status = 'revoked',
      revoked_by = transfer_row.sender_user_id,
      revoked_at = now(),
      revoked_reason = 'Pass ownership transferred',
      updated_at = now()
  WHERE pass_id = transfer_row.pass_id
    AND status = 'active';

  UPDATE public.pass_transfer_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = transfer_row.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_pass_transfer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pass_transfer(uuid) TO service_role;

COMMIT;
