-- Close the gap for pre-expired passes and orphaned event rows in admission QR validation.

BEGIN;

CREATE OR REPLACE FUNCTION public.expire_ended_event_passes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.passes AS pass
  SET status = 'expired', updated_at = statement_timestamp()
  FROM public.events AS event
  WHERE pass.event_id = event.id
    AND pass.status = 'active'
    AND event.ends_at IS NOT NULL
    AND event.ends_at <= statement_timestamp();

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  UPDATE public.qr_codes AS qr
  SET status = 'expired', updated_at = statement_timestamp()
  FROM public.passes AS pass
  JOIN public.events AS event ON event.id = pass.event_id
  WHERE qr.qr_type = 'pass'
    AND qr.status = 'active'
    AND qr.pass_id = pass.id::text
    AND event.ends_at IS NOT NULL
    AND event.ends_at <= statement_timestamp();

  RETURN expired_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_and_use_qr(
  p_token text,
  p_scanner_user_id text DEFAULT NULL,
  p_scanner_device_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qr public.qr_codes%ROWTYPE;
  v_status text;
  v_message text;
  v_next_count integer;
  v_pass_status text;
  v_event_ends_at timestamptz;
BEGIN
  SELECT * INTO v_qr
  FROM public.qr_codes
  WHERE token = nullif(btrim(p_token), '')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'status', 'invalid', 'message', 'QR code not found');
  END IF;

  IF v_qr.status = 'used' OR v_qr.usage_count >= v_qr.max_uses THEN
    v_status := 'already_used';
    v_message := 'This QR code has already been used';
  ELSIF v_qr.status IN ('revoked', 'suspended') THEN
    v_status := v_qr.status;
    v_message := coalesce(v_qr.revoked_reason, 'QR code is ' || v_qr.status);
  ELSIF v_qr.status = 'expired'
    OR (v_qr.expires_at IS NOT NULL AND v_qr.expires_at <= statement_timestamp()) THEN
    UPDATE public.qr_codes SET status = 'expired', updated_at = statement_timestamp() WHERE id = v_qr.id;
    v_status := 'expired';
    v_message := 'QR code has expired';
  ELSIF v_qr.status <> 'active' THEN
    v_status := v_qr.status;
    v_message := 'QR code is ' || v_qr.status;
  ELSIF v_qr.qr_type = 'pass' THEN
    SELECT pass.status::text, event.ends_at
    INTO v_pass_status, v_event_ends_at
    FROM public.passes AS pass
    JOIN public.events AS event ON event.id = pass.event_id
    WHERE pass.id::text = v_qr.pass_id;

    IF NOT FOUND THEN
      v_status := 'revoked';
      v_message := 'Pass or event for this QR code was not found';
      UPDATE public.qr_codes
      SET status = 'revoked', revoked_at = statement_timestamp(), revoked_reason = v_message,
          updated_at = statement_timestamp()
      WHERE id = v_qr.id;
    ELSIF v_pass_status = 'expired'
      OR (v_event_ends_at IS NOT NULL AND v_event_ends_at <= statement_timestamp()) THEN
      v_status := 'expired';
      v_message := 'Pass event has ended';
      UPDATE public.qr_codes SET status = 'expired', updated_at = statement_timestamp() WHERE id = v_qr.id;
    ELSIF v_pass_status IS DISTINCT FROM 'active' THEN
      v_status := 'revoked';
      v_message := 'Pass is no longer active';
      UPDATE public.qr_codes
      SET status = 'revoked', revoked_at = statement_timestamp(), revoked_reason = v_message,
          updated_at = statement_timestamp()
      WHERE id = v_qr.id;
    ELSE
      v_status := 'valid';
      v_message := 'QR code is valid';
    END IF;
  ELSE
    v_status := 'valid';
    v_message := 'QR code is valid';
  END IF;

  IF v_status = 'valid' THEN
    v_next_count := v_qr.usage_count + 1;
    UPDATE public.qr_codes
    SET usage_count = v_next_count,
        used_at = coalesce(used_at, statement_timestamp()),
        last_checked_at = statement_timestamp(),
        status = CASE WHEN v_next_count >= max_uses THEN 'used' ELSE status END,
        updated_at = statement_timestamp()
    WHERE id = v_qr.id;
  ELSE
    v_next_count := v_qr.usage_count;
    UPDATE public.qr_codes
    SET last_checked_at = statement_timestamp(), updated_at = statement_timestamp()
    WHERE id = v_qr.id;
  END IF;

  INSERT INTO public.qr_scan_logs (
    qr_code_id, token, scanned_by_user_id, scanned_by_device_id, scan_status, scan_message
  ) VALUES (
    v_qr.id, v_qr.token, p_scanner_user_id, p_scanner_device_id, v_status, v_message
  );

  RETURN jsonb_build_object(
    'valid', v_status = 'valid',
    'status', v_status,
    'message', v_message,
    'qr_data', v_qr.qr_data,
    'display_data', v_qr.display_data,
    'usage_count', v_next_count,
    'max_uses', v_qr.max_uses,
    'used_at', v_qr.used_at,
    'expires_at', v_qr.expires_at,
    'revoked_at', v_qr.revoked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.expire_ended_event_passes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ended_event_passes() TO service_role;
REVOKE ALL ON FUNCTION public.validate_and_use_qr(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_use_qr(text, text, text) TO service_role;

-- Also close QR codes for events which ended before this migration was applied.
SELECT public.expire_ended_event_passes();
NOTIFY pgrst, 'reload schema';

COMMIT;
