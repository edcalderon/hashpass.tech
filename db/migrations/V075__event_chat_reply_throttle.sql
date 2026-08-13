-- V075: serialized room posting limit and per-message reply references
--
-- A sender may post five consecutive room messages. The sixth is rejected
-- until another attendee posts, which prevents one account from monopolizing
-- a room while preserving normal back-and-forth conversation.

BEGIN;

ALTER TABLE public.event_chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
    REFERENCES public.event_chat_messages(id) ON DELETE SET NULL;

ALTER TABLE public.event_chat_direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid
    REFERENCES public.event_chat_direct_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS event_chat_messages_reply_idx
  ON public.event_chat_messages (reply_to_message_id);

CREATE INDEX IF NOT EXISTS event_chat_direct_messages_reply_idx
  ON public.event_chat_direct_messages (reply_to_message_id);

CREATE OR REPLACE FUNCTION public.send_event_chat_room_message(
  p_event_id text,
  p_sender_id uuid,
  p_message text,
  p_message_type text DEFAULT 'text',
  p_sender_display_name text DEFAULT NULL,
  p_reply_to_message_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  event_id text,
  sender_id uuid,
  sender_display_name text,
  message text,
  message_type text,
  reply_to_message_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trailing_sender uuid;
  consecutive_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':' || p_sender_id::text, 0)
  );

  IF p_reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.event_chat_messages reply
    WHERE reply.id = p_reply_to_message_id
      AND reply.event_id = p_event_id
  ) THEN
    RAISE EXCEPTION 'The reply target does not belong to this event room'
      USING ERRCODE = '22023';
  END IF;

  FOR trailing_sender IN
    SELECT recent.sender_id
    FROM public.event_chat_messages recent
    WHERE recent.event_id = p_event_id
    ORDER BY recent.created_at DESC, recent.id DESC
    LIMIT 5
  LOOP
    IF trailing_sender <> p_sender_id THEN
      EXIT;
    END IF;
    consecutive_count := consecutive_count + 1;
  END LOOP;

  IF consecutive_count >= 5 THEN
    RAISE EXCEPTION 'A reply from another attendee is required before you can send another message'
      USING ERRCODE = 'P0001', DETAIL = 'CHAT_RATE_LIMIT';
  END IF;

  RETURN QUERY
  INSERT INTO public.event_chat_messages (
    event_id,
    sender_id,
    sender_display_name,
    message,
    message_type,
    reply_to_message_id
  )
  VALUES (
    p_event_id,
    p_sender_id,
    p_sender_display_name,
    btrim(p_message),
    p_message_type,
    p_reply_to_message_id
  )
  RETURNING
    event_chat_messages.id,
    event_chat_messages.event_id,
    event_chat_messages.sender_id,
    event_chat_messages.sender_display_name,
    event_chat_messages.message,
    event_chat_messages.message_type,
    event_chat_messages.reply_to_message_id,
    event_chat_messages.created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.send_event_chat_room_message(text, uuid, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_event_chat_room_message(text, uuid, text, text, text, uuid)
  TO service_role;

COMMIT;
