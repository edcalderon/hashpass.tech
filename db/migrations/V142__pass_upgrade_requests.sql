-- V142: verified ticket-to-pass upgrade requests
-- Requests are written only through the server API and reviewed by event admins.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pass_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  -- The consolidated production schema stores pass ids as text while the
  -- shared development schema still stores UUIDs. Keep the request ledger
  -- portable across both profiles and validate ownership/existence in the
  -- server API before inserting a request.
  pass_id text NOT NULL,
  event_id text NOT NULL,
  current_pass_type text NOT NULL CHECK (current_pass_type IN ('general', 'business')),
  requested_pass_type text NOT NULL CHECK (requested_pass_type IN ('business', 'vip')),
  ticket_reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pass_upgrade_requests_next_tier_check CHECK (
    (current_pass_type = 'general' AND requested_pass_type = 'business')
    OR (current_pass_type = 'business' AND requested_pass_type = 'vip')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pass_upgrade_requests_pending_unique
  ON public.pass_upgrade_requests (pass_id, requested_pass_type)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS pass_upgrade_requests_review_queue
  ON public.pass_upgrade_requests (status, requested_at ASC);

ALTER TABLE public.pass_upgrade_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pass_upgrade_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pass_upgrade_requests TO service_role;

COMMIT;
