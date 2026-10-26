-- V148: issue admission QR codes only for the owner that was authorized.
--
-- The API authorizes a caller against passes.user_id and then calls
-- generate_pass_qr. If complete_pass_transfer commits between those steps, the
-- old function re-read the pass without checking the caller and issued a QR
-- for the new owner to the former owner. The authorized owner is now an
-- explicit argument, verified under a lock on the pass row that
-- complete_pass_transfer also takes, so authorization and issuance are one
-- atomic step: either the transfer commits first and issuance is refused, or
-- issuance commits first and the transfer then revokes the new code.

BEGIN;

-- The unbound signature must not remain callable.
DROP FUNCTION IF EXISTS public.generate_pass_qr(text, integer, integer);

CREATE OR REPLACE FUNCTION public.generate_pass_qr(
  p_pass_id text,
  p_expected_owner_id text,
  p_expires_in_minutes integer DEFAULT 30,
  p_max_uses integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass record;
  v_qr_id uuid;
  v_token text;
  v_expires integer := least(greatest(coalesce(p_expires_in_minutes, 30), 1), 1440);
  v_max_uses integer := least(greatest(coalesce(p_max_uses, 1), 1), 25);
BEGIN
  IF nullif(btrim(p_pass_id), '') IS NULL THEN
    RAISE EXCEPTION 'A pass id is required' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_expected_owner_id), '') IS NULL THEN
    RAISE EXCEPTION 'The authorized pass owner is required' USING ERRCODE = '22023';
  END IF;

  -- FOR SHARE conflicts with the FOR UPDATE that complete_pass_transfer takes
  -- on this row, while allowing concurrent issuance for the same owner.
  SELECT p.* INTO v_pass
  FROM public.passes p
  WHERE p.id::text = btrim(p_pass_id)
    AND p.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass not found or not active' USING ERRCODE = '22023';
  END IF;

  IF v_pass.user_id::text <> btrim(p_expected_owner_id) THEN
    RAISE EXCEPTION 'Pass ownership changed' USING ERRCODE = '55000';
  END IF;

  v_token := public.generate_qr_token();
  INSERT INTO public.qr_codes (
    token, qr_type, pass_id, user_id, qr_data, display_data,
    expires_at, max_uses
  ) VALUES (
    v_token,
    'pass',
    v_pass.id::text,
    v_pass.user_id::text,
    jsonb_build_object(
      'type', 'hashpass_qr',
      'pass_id', v_pass.id::text,
      'pass_number', v_pass.pass_number::text,
      'pass_type', v_pass.pass_type::text,
      'event_id', v_pass.event_id,
      'issued_at', extract(epoch from now())::bigint
    ),
    jsonb_build_object(
      'pass_number', v_pass.pass_number::text,
      'pass_type', v_pass.pass_type::text,
      'event_id', v_pass.event_id
    ),
    now() + make_interval(mins => v_expires),
    v_max_uses
  ) RETURNING id INTO v_qr_id;

  RETURN v_qr_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_pass_qr(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pass_qr(text, text, integer, integer)
  TO service_role;

COMMIT;
