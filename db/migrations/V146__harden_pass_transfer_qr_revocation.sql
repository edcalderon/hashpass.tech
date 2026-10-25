-- V146: prevent abandoned transfers and revoke admission material on ownership changes.
--
-- This follows V145 because it revokes backend-owned QR codes as part of the
-- same transaction that changes a pass owner.

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_pass_transfer(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  transfer_row public.pass_transfer_requests%ROWTYPE;
  pass_user text;
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

  SELECT user_id::text INTO pass_user
  FROM public.passes
  WHERE id::text = transfer_row.pass_id
    AND event_id = transfer_row.event_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND OR pass_user <> transfer_row.sender_user_id THEN
    RETURN false;
  END IF;

  UPDATE public.passes
  SET user_id = transfer_row.recipient_user_id
  WHERE id::text = transfer_row.pass_id;

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
