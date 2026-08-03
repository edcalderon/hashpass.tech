CREATE TABLE IF NOT EXISTS public.admin_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text NOT NULL,
  sent_by uuid NOT NULL, recipient_user_id uuid, recipient_email text NOT NULL,
  audience text NOT NULL, subject text NOT NULL, heading text NOT NULL, message text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed')), provider_message_id text, error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_email_deliveries_event_created_idx ON public.admin_email_deliveries(event_id, created_at DESC);
ALTER TABLE public.admin_email_deliveries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_matchmaking_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id text NOT NULL, created_by uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('manual','random')), requested_count integer NOT NULL,
  created_count integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'completed', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_matchmaking_runs ENABLE ROW LEVEL SECURITY;

-- Both tables are service-role-only. Event authorization is enforced by the API before access.
REVOKE ALL ON public.admin_email_deliveries, public.admin_matchmaking_runs FROM anon, authenticated;
