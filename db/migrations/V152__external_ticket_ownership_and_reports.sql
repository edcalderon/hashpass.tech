-- V152: let a confirmed impersonation release an external ticket, and give
-- users a way to report a ticket someone else has already claimed.
--
-- One original ticket maps to exactly one HashPass claimant. The unique
-- fingerprints from V145 keep enforcing that for every live claim; only a
-- claim an admin has revoked after a confirmed report stops reserving the
-- ticket, so the genuine holder can then claim it.

BEGIN;

ALTER TABLE public.external_ticket_claims
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_reason text;

DROP INDEX IF EXISTS public.external_ticket_claim_code_key;
DROP INDEX IF EXISTS public.external_ticket_claim_qr_key;
CREATE UNIQUE INDEX external_ticket_claim_code_key
  ON public.external_ticket_claims (issuer, event_id, ticket_code_hash)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX external_ticket_claim_qr_key
  ON public.external_ticket_claims (source_qr_digest)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.external_ticket_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES public.external_ticket_claims(id) ON DELETE SET NULL,
  reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  issuer text NOT NULL,
  ticket_code_hash text NOT NULL,
  ticket_code_last4 text NOT NULL,
  reason text NOT NULL DEFAULT 'impersonation'
    CHECK (reason IN ('impersonation', 'stolen', 'duplicate', 'other')),
  details text CHECK (details IS NULL OR char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'confirmed', 'dismissed')),
  reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewer_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- A reporter can have one open report per ticket; repeat reports are idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS external_ticket_report_open_key
  ON public.external_ticket_reports (reporter_user_id, issuer, event_id, ticket_code_hash)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS external_ticket_report_review_idx
  ON public.external_ticket_reports (status, created_at DESC);

ALTER TABLE public.external_ticket_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.external_ticket_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.external_ticket_reports TO service_role;

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

  -- Lock the code-owned claim first so concurrent retries serialize. Revoked
  -- claims no longer reserve the ticket. The claimant may only attach proof
  -- to their own pending claim.
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

    RETURN jsonb_build_object('id', v_claim.id, 'status', v_claim.status, 'pass_id', v_claim.hashpass_pass_id);
  END IF;

  -- A QR proof cannot be attached to a second ticket code, even when the
  -- code itself has not been submitted yet.
  SELECT * INTO v_qr_claim
  FROM public.external_ticket_claims
  WHERE source_qr_digest = v_digest
    AND revoked_at IS NULL
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

CREATE OR REPLACE FUNCTION public.report_external_ticket(
  p_reporter_user_id uuid,
  p_event_id text,
  p_issuer text,
  p_ticket_code text,
  p_reason text DEFAULT 'impersonation',
  p_details text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text := upper(btrim(coalesce(p_ticket_code, '')));
  v_issuer text := lower(nullif(btrim(coalesce(p_issuer, '')), ''));
  v_event_id text := lower(nullif(btrim(coalesce(p_event_id, '')), ''));
  v_reason text := lower(coalesce(nullif(btrim(p_reason), ''), 'impersonation'));
  v_hash text;
  v_claim public.external_ticket_claims%ROWTYPE;
  v_report_id uuid;
BEGIN
  IF p_reporter_user_id IS NULL OR v_event_id IS NULL OR v_issuer IS NULL THEN
    RAISE EXCEPTION 'A reporter, event and issuer are required' USING ERRCODE = '22023';
  END IF;
  IF length(v_code) < 4 OR length(v_code) > 128 THEN
    RAISE EXCEPTION 'A valid original ticket code is required' USING ERRCODE = '22023';
  END IF;
  IF v_reason NOT IN ('impersonation', 'stolen', 'duplicate', 'other') THEN
    RAISE EXCEPTION 'Unsupported report reason' USING ERRCODE = '22023';
  END IF;

  v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

  SELECT * INTO v_claim
  FROM public.external_ticket_claims
  WHERE issuer = v_issuer AND event_id = v_event_id
    AND ticket_code_hash = v_hash AND revoked_at IS NULL;
  IF FOUND AND v_claim.claimant_user_id = p_reporter_user_id THEN
    RAISE EXCEPTION 'You cannot report your own ticket claim' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.external_ticket_reports (
    claim_id, reporter_user_id, event_id, issuer, ticket_code_hash,
    ticket_code_last4, reason, details
  ) VALUES (
    v_claim.id, p_reporter_user_id, v_event_id, v_issuer, v_hash,
    right(v_code, 4), v_reason, left(nullif(btrim(p_details), ''), 1000)
  )
  ON CONFLICT (reporter_user_id, issuer, event_id, ticket_code_hash) WHERE status = 'open'
  DO UPDATE SET details = coalesce(EXCLUDED.details, public.external_ticket_reports.details)
  RETURNING id INTO v_report_id;

  RETURN jsonb_build_object('id', v_report_id, 'status', 'open', 'claim_found', v_claim.id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.report_external_ticket(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_external_ticket(uuid, text, text, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_external_ticket_report(
  p_report_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_report public.external_ticket_reports%ROWTYPE;
  v_claim public.external_ticket_claims%ROWTYPE;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_note text := left(nullif(btrim(p_note), ''), 1000);
BEGIN
  IF v_action NOT IN ('confirm', 'dismiss') THEN
    RAISE EXCEPTION 'Unsupported report action' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_report FROM public.external_ticket_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket report not found' USING ERRCODE = '22023'; END IF;
  IF v_report.status <> 'open' THEN
    RETURN jsonb_build_object('id', v_report.id, 'status', v_report.status);
  END IF;

  IF v_action = 'confirm' AND v_report.claim_id IS NOT NULL THEN
    SELECT * INTO v_claim FROM public.external_ticket_claims WHERE id = v_report.claim_id FOR UPDATE;
    IF FOUND AND v_claim.revoked_at IS NULL THEN
      -- Release the ticket for its genuine holder and take away whatever the
      -- impersonator obtained from it.
      UPDATE public.external_ticket_claims
      SET status = 'rejected', revoked_at = now(),
          revoked_reason = coalesce(v_note, 'Confirmed ticket impersonation'),
          reviewer_user_id = p_actor_user_id, reviewed_at = now()
      WHERE id = v_claim.id;

      UPDATE public.passes
      SET status = 'suspended', updated_at = now()
      WHERE source_external_ticket_claim_id = v_claim.id
        AND status = 'active';

      UPDATE public.qr_codes
      SET status = 'revoked', revoked_by = p_actor_user_id::text, revoked_at = now(),
          revoked_reason = 'External ticket impersonation confirmed', updated_at = now()
      WHERE pass_id = v_claim.hashpass_pass_id
        AND status = 'active';
    END IF;
  END IF;

  UPDATE public.external_ticket_reports
  SET status = CASE v_action WHEN 'confirm' THEN 'confirmed' ELSE 'dismissed' END,
      reviewer_user_id = p_actor_user_id, reviewer_note = v_note, resolved_at = now()
  WHERE id = v_report.id;

  RETURN jsonb_build_object(
    'id', v_report.id,
    'status', CASE v_action WHEN 'confirm' THEN 'confirmed' ELSE 'dismissed' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_external_ticket_report(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_external_ticket_report(uuid, uuid, text, text)
  TO service_role;

COMMIT;
