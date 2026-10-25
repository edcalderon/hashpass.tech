-- V144: dedicated VIP event rooms
--
-- Global and VIP messages share the existing event-chat storage, but every
-- read, write, reaction, reply throttle, and presence row is scoped to the
-- selected room channel. The backend remains the only role allowed to access
-- these tables, so the VIP pass check cannot be bypassed from the client.

BEGIN;

ALTER TABLE public.event_chat_messages
  ADD COLUMN IF NOT EXISTS room_channel text NOT NULL DEFAULT 'global';

ALTER TABLE public.event_chat_messages
  DROP CONSTRAINT IF EXISTS event_chat_messages_room_channel_check;

ALTER TABLE public.event_chat_messages
  ADD CONSTRAINT event_chat_messages_room_channel_check
  CHECK (room_channel IN ('global', 'vip'));

CREATE INDEX IF NOT EXISTS event_chat_messages_event_channel_created_idx
  ON public.event_chat_messages (event_id, room_channel, created_at);

ALTER TABLE public.event_chat_presence
  ADD COLUMN IF NOT EXISTS room_channel text NOT NULL DEFAULT 'global';

ALTER TABLE public.event_chat_presence
  DROP CONSTRAINT IF EXISTS event_chat_presence_room_channel_check;

ALTER TABLE public.event_chat_presence
  ADD CONSTRAINT event_chat_presence_room_channel_check
  CHECK (room_channel IN ('global', 'vip'));

ALTER TABLE public.event_chat_presence
  DROP CONSTRAINT IF EXISTS event_chat_presence_pkey;

ALTER TABLE public.event_chat_presence
  ADD CONSTRAINT event_chat_presence_pkey
  PRIMARY KEY (event_id, room_channel, user_id);

CREATE INDEX IF NOT EXISTS event_chat_presence_event_channel_active_idx
  ON public.event_chat_presence (event_id, room_channel, last_seen_at);

DROP FUNCTION IF EXISTS public.send_event_chat_room_message(text, uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.send_event_chat_room_message(
  p_event_id text,
  p_sender_id uuid,
  p_message text,
  p_message_type text DEFAULT 'text',
  p_sender_display_name text DEFAULT NULL,
  p_reply_to_message_id uuid DEFAULT NULL,
  p_room_channel text DEFAULT 'global'
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
  v_room_channel text := COALESCE(NULLIF(btrim(p_room_channel), ''), 'global');
BEGIN
  IF v_room_channel NOT IN ('global', 'vip') THEN
    RAISE EXCEPTION 'Unsupported event chat room channel'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':' || v_room_channel || ':' || p_sender_id::text, 0)
  );

  IF p_reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.event_chat_messages reply
    WHERE reply.id = p_reply_to_message_id
      AND reply.event_id = p_event_id
      AND reply.room_channel = v_room_channel
  ) THEN
    RAISE EXCEPTION 'The reply target does not belong to this event room'
      USING ERRCODE = '22023';
  END IF;

  FOR trailing_sender IN
    SELECT recent.sender_id
    FROM public.event_chat_messages recent
    WHERE recent.event_id = p_event_id
      AND recent.room_channel = v_room_channel
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
    room_channel,
    sender_id,
    sender_display_name,
    message,
    message_type,
    reply_to_message_id
  )
  VALUES (
    p_event_id,
    v_room_channel,
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

REVOKE ALL ON FUNCTION public.send_event_chat_room_message(text, uuid, text, text, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_event_chat_room_message(text, uuid, text, text, text, uuid, text)
  TO service_role;

COMMIT;
