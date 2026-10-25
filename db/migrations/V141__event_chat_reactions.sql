-- V141: LinkedIn-style reactions for event room and direct chat messages
--
-- Reactions are kept behind the same server-only boundary as chat messages.
-- A pass holder may choose one reaction per message and can remove or replace
-- it without gaining direct access to the underlying Supabase tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_chat_message_reactions (
  event_id text NOT NULL REFERENCES public.event_chat_rooms(event_id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.event_chat_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'celebrate', 'support', 'love', 'insightful', 'funny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.event_chat_direct_message_reactions (
  event_id text NOT NULL REFERENCES public.event_chat_rooms(event_id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.event_chat_direct_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'celebrate', 'support', 'love', 'insightful', 'funny')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_chat_message_reactions_event_message_idx
  ON public.event_chat_message_reactions (event_id, message_id);

CREATE INDEX IF NOT EXISTS event_chat_direct_message_reactions_event_message_idx
  ON public.event_chat_direct_message_reactions (event_id, message_id);

ALTER TABLE public.event_chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_chat_direct_message_reactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_chat_message_reactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.event_chat_direct_message_reactions FROM anon, authenticated;
GRANT ALL ON TABLE public.event_chat_message_reactions TO service_role;
GRANT ALL ON TABLE public.event_chat_direct_message_reactions TO service_role;

COMMIT;
