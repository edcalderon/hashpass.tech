-- V073: isolate event chat data behind canonical per-event room records
--
-- The API checks this registry before checking a pass. The registry is also
-- the parent key for future chat rows, so an event id cannot be invented by a
-- client or accidentally mixed with another event's room.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_chat_rooms (
  event_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.event_chat_rooms (event_id)
VALUES ('bsl2025'), ('peru2026'), ('chile2026'), ('colombia2026')
ON CONFLICT (event_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_chat_messages_event_room_fkey'
      AND conrelid = 'public.event_chat_messages'::regclass
  ) THEN
    ALTER TABLE public.event_chat_messages
      ADD CONSTRAINT event_chat_messages_event_room_fkey
      FOREIGN KEY (event_id) REFERENCES public.event_chat_rooms(event_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_chat_direct_messages_event_room_fkey'
      AND conrelid = 'public.event_chat_direct_messages'::regclass
  ) THEN
    ALTER TABLE public.event_chat_direct_messages
      ADD CONSTRAINT event_chat_direct_messages_event_room_fkey
      FOREIGN KEY (event_id) REFERENCES public.event_chat_rooms(event_id)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.event_chat_rooms ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.event_chat_rooms FROM anon, authenticated;
GRANT ALL ON TABLE public.event_chat_rooms TO service_role;

COMMIT;
