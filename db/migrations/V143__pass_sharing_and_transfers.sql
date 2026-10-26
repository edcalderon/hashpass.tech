-- V143: opaque public pass shares and two-party ticket transfers.
-- Tokens are generated and hashed by the server API.  The client never gets
-- a database id or an admission QR token.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pass_public_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id text NOT NULL,
  event_id text NOT NULL,
  owner_user_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS pass_public_shares_pass_idx
  ON public.pass_public_shares (pass_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pass_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_id text NOT NULL,
  event_id text NOT NULL,
  sender_user_id text NOT NULL,
  recipient_user_id text NOT NULL,
  recipient_email text NOT NULL,
  sender_token_hash text NOT NULL UNIQUE,
  recipient_token_hash text NOT NULL UNIQUE,
  sender_confirmed_at timestamptz,
  recipient_confirmed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled', 'expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pass_transfer_requests_pending_pass_idx
  ON public.pass_transfer_requests (pass_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS pass_transfer_requests_sender_idx
  ON public.pass_transfer_requests (sender_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pass_transfer_requests_recipient_idx
  ON public.pass_transfer_requests (recipient_user_id, created_at DESC);

-- The final ownership change is performed inside a row-locked function so a
-- repeated email click cannot complete the same transfer twice or race a
-- second transfer request for the same pass.
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

  IF NOT FOUND OR transfer_row.status <> 'pending'
     OR transfer_row.expires_at <= now()
     OR transfer_row.sender_confirmed_at IS NULL
     OR transfer_row.recipient_confirmed_at IS NULL THEN
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

  UPDATE public.pass_transfer_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = transfer_row.id;
  RETURN true;
END;
$$;

ALTER TABLE public.pass_public_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pass_transfer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pass_public_shares FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pass_transfer_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pass_public_shares TO service_role;
GRANT ALL ON public.pass_transfer_requests TO service_role;
REVOKE ALL ON FUNCTION public.complete_pass_transfer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pass_transfer(uuid) TO service_role;

COMMIT;
