-- V074: backend-authorized live event-room presence

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_chat_presence (
  event_id text NOT NULL REFERENCES public.event_chat_rooms(event_id),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_chat_presence_active_idx
  ON public.event_chat_presence (event_id, last_seen_at);

ALTER TABLE public.event_chat_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_chat_presence FROM anon, authenticated;
GRANT ALL ON TABLE public.event_chat_presence TO service_role;

COMMIT;
