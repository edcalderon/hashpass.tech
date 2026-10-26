-- V150: keep automatic QR issuance compatible with V148's owner-bound API.
--
-- V148 intentionally removed generate_pass_qr(pass_id, expires, max_uses) so
-- a stale caller cannot issue a QR after ownership changes. These helpers are
-- trusted server-side callers, but they still must supply the pass owner to
-- retain that concurrency protection.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_generate_pass_qr()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qr_id uuid;
BEGIN
  -- Only generate a QR for an active pass that was just created or activated.
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    BEGIN
      SELECT public.generate_pass_qr(NEW.id::text, NEW.user_id::text, 30, 1)
      INTO v_qr_id;

      IF v_qr_id IS NULL THEN
        RAISE WARNING 'Failed to auto-generate QR code for pass %', NEW.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- QR issuance is non-blocking for pass creation or activation.
      RAISE WARNING 'Error auto-generating QR code for pass %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_existing_passes_with_qr()
RETURNS TABLE(pass_id text, qr_created boolean, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass record;
  v_qr_id uuid;
BEGIN
  -- Backfill active passes only when they have no usable pass QR code.
  FOR v_pass IN
    SELECT p.id, p.pass_number, p.pass_type, p.user_id, p.event_id, p.status
    FROM public.passes p
    WHERE p.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM public.qr_codes qr
        WHERE qr.pass_id = p.id
          AND qr.status = 'active'
          AND qr.expires_at > now()
      )
    ORDER BY p.created_at DESC
  LOOP
    BEGIN
      SELECT public.generate_pass_qr(v_pass.id::text, v_pass.user_id::text, 30, 1)
      INTO v_qr_id;

      pass_id := v_pass.id::text;
      qr_created := v_qr_id IS NOT NULL;
      error_message := CASE
        WHEN v_qr_id IS NULL THEN 'QR generation returned NULL'
        ELSE NULL
      END;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      pass_id := v_pass.id::text;
      qr_created := false;
      error_message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;

  RETURN;
END;
$$;

COMMIT;
