-- Legacy printed invites are campaign codes, not user-owned qr_links.
-- Keep an append-only visit ledger without IPs, cookies or raw user agents.
CREATE TABLE public.invite_scan_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invite_code text NOT NULL CHECK (invite_code ~ '^[A-Za-z0-9_-]{1,64}$'),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  device_type text NOT NULL,
  bot_classification text NOT NULL CHECK (bot_classification IN ('human', 'bot'))
);
CREATE INDEX invite_scans_code_time_idx
  ON public.invite_scan_events (invite_code, scanned_at DESC);

ALTER TABLE public.invite_scan_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invite_scan_events FROM anon, authenticated;
GRANT SELECT, INSERT ON public.invite_scan_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.invite_scan_events_id_seq TO service_role;

COMMENT ON TABLE public.invite_scan_events IS
  'Invite URL GET visits since tracking was enabled; includes shared-link opens and classified bots, not proven camera scans. HEAD and prefetch requests excluded.';
