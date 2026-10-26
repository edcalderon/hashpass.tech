-- V151: attach later QR proof to an existing manual ticket claim.
--
-- A claimant may first submit a ticket code and then resubmit the same ticket
-- after scanning its original QR. Keep the claim idempotent, but upgrade the
-- pending manual fingerprint to the supplied QR proof so admin inspection can
-- find it by digest.

BEGIN;

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

  -- Lock the code-owned claim first so concurrent retries serialize. The
  -- claimant may only attach proof to their own pending claim.
  SELECT * INTO v_claim
  FROM public.external_ticket_claims
  WHERE issuer = v_issuer
    AND event_id = v_event_id
    AND ticket_code_hash = v_hash
  FOR UPDATE;
  IF FOUND THEN
    IF v_claim.claimant_user_id <> p_user_id THEN
      RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
    END IF;

    -- A QR digest is a real proof; manual:<hash> is only the fallback used
    -- when the first submission contained a ticket code without a QR scan.
    IF v_digest NOT LIKE 'manual:%'
       AND v_claim.source_qr_digest IS DISTINCT FROM v_digest THEN
      SELECT * INTO v_qr_claim
      FROM public.external_ticket_claims
      WHERE source_qr_digest = v_digest
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

    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id);
  END IF;

  -- A QR proof cannot be attached to a second ticket code, even when the
  -- code itself has not been submitted yet.
  SELECT * INTO v_qr_claim
  FROM public.external_ticket_claims
  WHERE source_qr_digest = v_digest
  FOR UPDATE;
  IF FOUND THEN
    IF v_qr_claim.claimant_user_id <> p_user_id THEN
      RAISE EXCEPTION 'This original ticket has already been claimed' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_qr_claim.id, 'status', v_qr_claim.status, 'pass_id', v_qr_claim.hashpass_pass_id);
  END IF;

  INSERT INTO public.external_ticket_claims (
    event_id, issuer, claimant_user_id, ticket_code_hash, ticket_code_last4,
    source_qr_digest, source_qr_payload, source_ticket_metadata, requested_pass_type
  ) VALUES (
    v_event_id, v_issuer, p_user_id, v_hash, right(v_code, 4),
    v_digest, coalesce(p_source_qr_payload, '{}'::jsonb), coalesce(p_source_ticket_metadata, '{}'::jsonb),
    p_requested_pass_type
  ) RETURNING * INTO v_claim;

  RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_external_ticket_claim(uuid, text, text, text, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_external_ticket_claim(uuid, text, text, text, text, jsonb, jsonb, text)
  TO service_role;

COMMIT;
