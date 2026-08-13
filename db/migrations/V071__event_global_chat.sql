-- V071: pass-gated global event rooms and VIP direct messages
--
-- The mobile app reaches these tables only through the authenticated backend
-- route. RLS remains enabled without client policies so a browser/native client
-- cannot bypass the pass-tier checks by querying Supabase directly.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_display_name text CHECK (sender_display_name IS NULL OR char_length(btrim(sender_display_name)) BETWEEN 1 AND 80),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'emoji')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_chat_messages_event_created_idx
  ON public.event_chat_messages (event_id, created_at);

CREATE TABLE IF NOT EXISTS public.event_chat_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_display_name text CHECK (sender_display_name IS NULL OR char_length(btrim(sender_display_name)) BETWEEN 1 AND 80),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'emoji')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS event_chat_direct_messages_thread_idx
  ON public.event_chat_direct_messages (event_id, sender_id, recipient_id, created_at);

ALTER TABLE public.event_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_chat_direct_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_chat_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.event_chat_direct_messages FROM anon, authenticated;
GRANT ALL ON TABLE public.event_chat_messages TO service_role;
GRANT ALL ON TABLE public.event_chat_direct_messages TO service_role;

COMMIT;
