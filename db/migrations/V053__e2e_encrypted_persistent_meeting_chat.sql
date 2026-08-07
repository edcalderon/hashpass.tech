-- Replaces the previous plaintext meeting_chat_messages persistence layer
-- (unused in practice -- 0 rows in prod, and actually broken on dev, where
-- sender_id's FK pointed at the public.user registry while RLS and every
-- real caller compare against auth.uid() -- the same registry-vs-auth-id
-- class of bug as V046/V050 earlier this session) with a design where
-- message content is encrypted client-side before it ever reaches the
-- server: each user holds a device-local X25519 keypair (private key never
-- leaves the device, SecureStore-only); only the public key is published to
-- user_chat_keys. Messages are encrypted with a per-conversation
-- XChaCha20-Poly1305 key derived via HKDF-SHA256 from the ECDH shared
-- secret between the two participants' X25519 keys -- the server only ever
-- stores/relays ciphertext + nonce and cannot decrypt messages even with
-- full DB access.
--
-- Also cleans up real schema drift found while designing this: prod still
-- carried a vestigial meeting_request_id column plus a second, older set of
-- RLS policies referencing it (chat_select_participant/chat_insert_participant)
-- alongside the newer meeting_id-based ones; dev never had that legacy
-- column but had sender_id's/user_id's FK pointed at the wrong table. Both
-- environments converge on one clean shape here.
--
-- Single-device key model, by deliberate product decision: losing a device
-- or reinstalling generates a new keypair, and publishing it replaces the
-- old public key -- permanently losing the ability to decrypt prior
-- messages on that device. No cross-device key backup/escrow is built; this
-- is a chosen simplicity/security tradeoff, not an oversight. See
-- apps/docs/docs/reference/mobile-app/e2e-meeting-chat.md for the full
-- design writeup.

-- ============================================================================
-- user_chat_keys: public-key directory (public keys are, by definition, not
-- secret -- any authenticated user may read any row; only the owner may
-- publish/update their own).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_chat_keys (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_chat_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_chat_keys_select_any ON public.user_chat_keys;
CREATE POLICY user_chat_keys_select_any ON public.user_chat_keys
  FOR SELECT USING (true);

DROP POLICY IF EXISTS user_chat_keys_insert_own ON public.user_chat_keys;
CREATE POLICY user_chat_keys_insert_own ON public.user_chat_keys
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_chat_keys_update_own ON public.user_chat_keys;
CREATE POLICY user_chat_keys_update_own ON public.user_chat_keys
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.user_chat_keys TO authenticated;
GRANT ALL ON public.user_chat_keys TO service_role;

-- ============================================================================
-- meeting_chat_messages: drop legacy artifacts, move to ciphertext/nonce
-- ============================================================================
-- Baseline: meeting_id was never added by any earlier migration even
-- though this file's own comment above already describes it as the
-- established, newer column sitting alongside the legacy
-- meeting_request_id this file removes -- flagged by code review
-- 2026-08-06, same class of gap as V009/V017/V022/V024/V038/V039/V007.
ALTER TABLE public.meeting_chat_messages ADD COLUMN IF NOT EXISTS meeting_id uuid;
DO $$ BEGIN
  ALTER TABLE public.meeting_chat_messages
    ADD CONSTRAINT meeting_chat_messages_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.meeting_chat_messages ALTER COLUMN meeting_id SET NOT NULL;

DROP POLICY IF EXISTS chat_select_participant ON public.meeting_chat_messages;
DROP POLICY IF EXISTS chat_insert_participant ON public.meeting_chat_messages;
DROP POLICY IF EXISTS meeting_chat_messages_select_participant ON public.meeting_chat_messages;
DROP POLICY IF EXISTS meeting_chat_messages_insert_participant ON public.meeting_chat_messages;

ALTER TABLE public.meeting_chat_messages DROP CONSTRAINT IF EXISTS meeting_chat_messages_meeting_request_id_fkey;
ALTER TABLE public.meeting_chat_messages DROP COLUMN IF EXISTS meeting_request_id;

ALTER TABLE public.meeting_chat_messages DROP CONSTRAINT IF EXISTS meeting_chat_messages_sender_id_fkey;
ALTER TABLE public.meeting_chat_messages
  ADD CONSTRAINT meeting_chat_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.meeting_chat_messages ADD COLUMN IF NOT EXISTS ciphertext text;
ALTER TABLE public.meeting_chat_messages ADD COLUMN IF NOT EXISTS nonce text;
UPDATE public.meeting_chat_messages SET ciphertext = '', nonce = '' WHERE ciphertext IS NULL;
ALTER TABLE public.meeting_chat_messages ALTER COLUMN ciphertext SET NOT NULL;
ALTER TABLE public.meeting_chat_messages ALTER COLUMN nonce SET NOT NULL;
ALTER TABLE public.meeting_chat_messages DROP COLUMN IF EXISTS message;

CREATE POLICY meeting_chat_messages_select_participant ON public.meeting_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_chat_messages.meeting_id
        AND (
          m.requester_id = auth.uid() OR m.host_id = auth.uid() OR m.attendee_id = auth.uid()
          OR m.speaker_id IN (SELECT s.id FROM public.bsl_speakers s WHERE s.user_id = auth.uid())
        )
    )
  );

CREATE POLICY meeting_chat_messages_insert_participant ON public.meeting_chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.id = meeting_chat_messages.meeting_id
        AND (
          m.requester_id = auth.uid() OR m.host_id = auth.uid() OR m.attendee_id = auth.uid()
          OR m.speaker_id IN (SELECT s.id FROM public.bsl_speakers s WHERE s.user_id = auth.uid())
        )
    )
  );

GRANT SELECT, INSERT ON public.meeting_chat_messages TO authenticated;
GRANT ALL ON public.meeting_chat_messages TO service_role;

-- ============================================================================
-- chat_last_seen: same FK fix, drop legacy column
-- ============================================================================
ALTER TABLE public.chat_last_seen DROP CONSTRAINT IF EXISTS chat_last_seen_meeting_request_id_fkey;
ALTER TABLE public.chat_last_seen DROP COLUMN IF EXISTS meeting_request_id;

ALTER TABLE public.chat_last_seen DROP CONSTRAINT IF EXISTS chat_last_seen_user_id_fkey;
ALTER TABLE public.chat_last_seen
  ADD CONSTRAINT chat_last_seen_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

DROP POLICY IF EXISTS chat_last_seen_select_own ON public.chat_last_seen;
CREATE POLICY chat_last_seen_select_own ON public.chat_last_seen
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_last_seen_insert_own ON public.chat_last_seen;
CREATE POLICY chat_last_seen_insert_own ON public.chat_last_seen
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_last_seen_update_own ON public.chat_last_seen;
CREATE POLICY chat_last_seen_update_own ON public.chat_last_seen
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_last_seen_upsert_own ON public.chat_last_seen;

GRANT SELECT, INSERT, UPDATE ON public.chat_last_seen TO authenticated;
GRANT ALL ON public.chat_last_seen TO service_role;

-- ============================================================================
-- RPCs -- uuid-typed (old (text,text[,...]) signatures dropped outright,
-- callers are updated in the same change as this migration)
-- ============================================================================
DROP FUNCTION IF EXISTS public.send_meeting_chat_message(text, text, text, text);
CREATE OR REPLACE FUNCTION public.send_meeting_chat_message(
  p_meeting_id uuid,
  p_sender_id uuid,
  p_ciphertext text,
  p_nonce text,
  p_message_type text DEFAULT 'text'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_recipient_id uuid;
  v_sender_name text;
  v_id uuid;
  v_created_at timestamptz;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so participancy must be re-checked here
  -- explicitly -- mirrors the table's own INSERT policy predicate above.
  SELECT * INTO v_meeting FROM public.meetings m WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  IF p_sender_id IS DISTINCT FROM v_meeting.requester_id
     AND p_sender_id IS DISTINCT FROM v_meeting.host_id
     AND p_sender_id IS DISTINCT FROM v_meeting.attendee_id
     AND NOT EXISTS (
       SELECT 1 FROM public.bsl_speakers s
       WHERE s.id::text = v_meeting.speaker_id::text AND s.user_id = p_sender_id
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF length(coalesce(p_ciphertext, '')) = 0 OR length(coalesce(p_nonce, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_message');
  END IF;

  INSERT INTO public.meeting_chat_messages (meeting_id, sender_id, ciphertext, nonce, message_type)
  VALUES (p_meeting_id, p_sender_id, p_ciphertext, p_nonce, COALESCE(NULLIF(p_message_type, ''), 'text'))
  RETURNING id, created_at INTO v_id, v_created_at;

  -- Notify the other participant -- generic, content-free (the server
  -- cannot read the ciphertext to summarize it even if it wanted to).
  v_recipient_id := CASE WHEN v_meeting.requester_id = p_sender_id THEN v_meeting.host_id ELSE v_meeting.requester_id END;
  v_sender_name := CASE WHEN v_meeting.requester_id = p_sender_id THEN v_meeting.requester_name ELSE v_meeting.speaker_name END;

  IF v_recipient_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_recipient_id, 'chat_message', 'New message',
      COALESCE(v_sender_name, 'Someone') || ' sent you a message.',
      NULL, p_sender_id::text, false, p_meeting_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'created_at', v_created_at);
END;
$$;

DROP FUNCTION IF EXISTS public.get_meeting_chat_messages(text, text);
CREATE OR REPLACE FUNCTION public.get_meeting_chat_messages(
  p_meeting_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_messages jsonb;
BEGIN
  SELECT * INTO v_meeting FROM public.meetings m WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  IF p_user_id IS DISTINCT FROM v_meeting.requester_id
     AND p_user_id IS DISTINCT FROM v_meeting.host_id
     AND p_user_id IS DISTINCT FROM v_meeting.attendee_id
     AND NOT EXISTS (
       SELECT 1 FROM public.bsl_speakers s
       WHERE s.id::text = v_meeting.speaker_id::text AND s.user_id = p_user_id
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'meeting_id', m.meeting_id,
      'sender_id', m.sender_id,
      'ciphertext', m.ciphertext,
      'nonce', m.nonce,
      'message_type', m.message_type,
      'is_read', m.is_read,
      'created_at', m.created_at
    )
    ORDER BY m.created_at ASC
  ) INTO v_messages
  FROM public.meeting_chat_messages m
  WHERE m.meeting_id = p_meeting_id;

  RETURN jsonb_build_object('success', true, 'messages', COALESCE(v_messages, '[]'::jsonb));
END;
$$;

DROP FUNCTION IF EXISTS public.update_chat_last_seen(text, text);
CREATE OR REPLACE FUNCTION public.update_chat_last_seen(
  p_user_id uuid,
  p_meeting_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Not touching updated_at here: prod's chat_last_seen never had that
  -- column (dev's does, via its own trigger) -- last_seen_at alone is the
  -- column this feature actually depends on, so leaving updated_at out of
  -- this statement keeps it portable across both shapes.
  INSERT INTO public.chat_last_seen (user_id, meeting_id, last_seen_at)
  VALUES (p_user_id, p_meeting_id, now())
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    last_seen_at = now()
  RETURNING last_seen_at INTO v_seen;

  RETURN jsonb_build_object('success', true, 'last_seen_at', v_seen);
END;
$$;

DROP FUNCTION IF EXISTS public.get_chat_last_seen(text, text);
CREATE OR REPLACE FUNCTION public.get_chat_last_seen(
  p_user_id uuid,
  p_meeting_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  SELECT last_seen_at INTO v_seen
  FROM public.chat_last_seen
  WHERE user_id = p_user_id AND meeting_id = p_meeting_id
  LIMIT 1;

  RETURN jsonb_build_object('success', true, 'has_seen', v_seen IS NOT NULL, 'last_seen_at', v_seen);
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_chat_public_key(uuid);
CREATE OR REPLACE FUNCTION public.get_user_chat_public_key(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT public_key INTO v_key FROM public.user_chat_keys WHERE user_id = p_user_id;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'key_not_found');
  END IF;
  RETURN jsonb_build_object('success', true, 'public_key', v_key);
END;
$$;

DROP FUNCTION IF EXISTS public.publish_user_chat_public_key(uuid, text);
CREATE OR REPLACE FUNCTION public.publish_user_chat_public_key(
  p_user_id uuid,
  p_public_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF length(coalesce(p_public_key, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_public_key');
  END IF;

  INSERT INTO public.user_chat_keys (user_id, public_key)
  VALUES (p_user_id, p_public_key)
  ON CONFLICT (user_id) DO UPDATE SET
    public_key = EXCLUDED.public_key,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_meeting_chat_message(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_chat_messages(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_last_seen(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_last_seen(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_chat_public_key(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_user_chat_public_key(uuid, text) TO authenticated;
