-- V072: enable realtime invalidation for backend-authorized event chat
--
-- Clients subscribe only to INSERT notifications and then reload through the
-- authenticated API. They never render the Realtime payload or query rows
-- directly, so pass-tier authorization remains centralized in the backend.

BEGIN;

ALTER TABLE public.event_chat_messages
  ADD COLUMN IF NOT EXISTS sender_display_name text;

ALTER TABLE public.event_chat_direct_messages
  ADD COLUMN IF NOT EXISTS sender_display_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_chat_messages_sender_display_name_check'
      AND conrelid = 'public.event_chat_messages'::regclass
  ) THEN
    ALTER TABLE public.event_chat_messages
      ADD CONSTRAINT event_chat_messages_sender_display_name_check
      CHECK (sender_display_name IS NULL OR char_length(btrim(sender_display_name)) BETWEEN 1 AND 80);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_chat_direct_messages_sender_display_name_check'
      AND conrelid = 'public.event_chat_direct_messages'::regclass
  ) THEN
    ALTER TABLE public.event_chat_direct_messages
      ADD CONSTRAINT event_chat_direct_messages_sender_display_name_check
      CHECK (sender_display_name IS NULL OR char_length(btrim(sender_display_name)) BETWEEN 1 AND 80);
  END IF;
END;
$$;

ALTER TABLE public.event_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.event_chat_direct_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'event_chat_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.event_chat_messages;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'event_chat_direct_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.event_chat_direct_messages;
    END IF;
  END IF;
END;
$$;

COMMIT;
