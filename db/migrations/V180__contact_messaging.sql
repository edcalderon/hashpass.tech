-- Global contacts messaging. All actors are resolved by the authenticated API.
BEGIN;
CREATE TABLE public.contact_handles (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,30}$')
);
ALTER TABLE public.contact_handles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_handles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contact_handles TO service_role;
-- Preserve existing unambiguous usernames. Duplicate names must be claimed explicitly.
INSERT INTO public.contact_handles(user_id, handle)
SELECT id, handle FROM (
  SELECT id, lower(profile_metadata->>'username') AS handle,
    count(*) OVER (PARTITION BY lower(profile_metadata->>'username')) AS occurrences
  FROM public."user" WHERE deleted_at IS NULL
) candidates WHERE occurrences = 1 AND handle ~ '^[a-z0-9_]{3,30}$'
ON CONFLICT DO NOTHING;

ALTER FUNCTION public.contact_network(uuid,text,jsonb) RENAME TO contact_network_before_messaging;
CREATE FUNCTION public.contact_network(p_user_id uuid, p_action text, p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_card uuid; result jsonb;
BEGIN
  IF p_action = 'handle' THEN
    IF coalesce(p_payload->>'handle', '') !~ '^[a-z0-9_]{3,30}$' THEN
      RAISE EXCEPTION 'Invalid handle' USING ERRCODE = '22023';
    END IF;
    -- A claimed handle cannot be reassigned, avoiding impersonation of old handles.
    INSERT INTO contact_handles(user_id, handle) VALUES (p_user_id, p_payload->>'handle');
    p_action := 'read';
  ELSIF p_action = 'request_handle' THEN
    SELECT p.share_id INTO target_card FROM contact_handles h
      JOIN contact_profiles p ON p.id = h.user_id WHERE h.handle = p_payload->>'handle';
    IF target_card IS NULL THEN RAISE EXCEPTION 'Contact request unavailable'; END IF;
    p_action := 'request';
    p_payload := jsonb_build_object('card', target_card);
  END IF;
  result := contact_network_before_messaging(p_user_id, p_action, p_payload);
  RETURN result || jsonb_build_object('handle', (SELECT handle FROM contact_handles WHERE user_id = p_user_id));
END $$;
REVOKE ALL ON FUNCTION public.contact_network(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_network(uuid,text,jsonb) TO service_role;

CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  sender uuid NOT NULL REFERENCES public.contact_profiles(id) ON DELETE CASCADE,
  recipient uuid NOT NULL REFERENCES public.contact_profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (sender <> recipient)
);
CREATE INDEX contact_messages_pair ON public.contact_messages(LEAST(sender,recipient), GREATEST(sender,recipient), sequence DESC);
CREATE INDEX contact_messages_sender_time ON public.contact_messages(sender, created_at DESC);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.contact_messages_sequence_seq TO service_role;

CREATE FUNCTION public.contact_messaging(p_user_id uuid, p_action text, p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE peer uuid; edge uuid; message_id uuid; result jsonb;
BEGIN
  IF p_action IN ('thread', 'send') THEN
    peer := (p_payload->>'peer')::uuid;
    IF p_action = 'send' THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 175)); END IF;
    -- Serialize sends per connection, so sequence order matches commit order.
    SELECT id INTO edge FROM contact_requests WHERE status = 'accepted'
      AND LEAST(sender,recipient) = LEAST(p_user_id,peer)
      AND GREATEST(sender,recipient) = GREATEST(p_user_id,peer) FOR UPDATE;
    IF edge IS NULL THEN RAISE EXCEPTION 'A mutual connection is required' USING ERRCODE = '42501'; END IF;
    IF p_action = 'send' THEN
      message_id := (p_payload->>'id')::uuid;
      IF EXISTS (SELECT 1 FROM contact_messages WHERE id = message_id AND
        (sender <> p_user_id OR recipient <> peer OR body <> btrim(p_payload->>'body'))) THEN
        RAISE EXCEPTION 'Message conflict';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM contact_messages WHERE id = message_id) THEN
        IF (SELECT count(*) FROM contact_messages WHERE sender = p_user_id AND created_at > now() - interval '1 minute') >= 30 THEN
          RAISE EXCEPTION 'Please wait before sending more messages';
        END IF;
        INSERT INTO contact_messages(id,sender,recipient,body) VALUES(message_id,p_user_id,peer,btrim(p_payload->>'body'));
      END IF;
    END IF;
    SELECT jsonb_build_object('messages', coalesce(jsonb_agg(to_jsonb(m) || jsonb_build_object('sequence', m.sequence::text) ORDER BY m.sequence), '[]')) INTO result FROM (
      SELECT id, sequence, sender, recipient, body, created_at FROM contact_messages
      WHERE LEAST(sender,recipient) = LEAST(p_user_id,peer) AND GREATEST(sender,recipient) = GREATEST(p_user_id,peer)
        AND (p_action = 'send' OR nullif(p_payload->>'before','') IS NULL OR sequence < (p_payload->>'before')::bigint)
      ORDER BY sequence DESC LIMIT 50
    ) m;
    RETURN result;
  ELSIF p_action <> 'read' THEN
    RAISE EXCEPTION 'Unknown messaging action' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_build_object('self',p_user_id,'conversations',coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.latest_sequence DESC NULLS LAST,c.name,c.id),'[]'))
    INTO result FROM (
      SELECT DISTINCT ON (p.id) p.id,p.name,p.role,p.company,p.avatar_url,h.handle,
        last_message.body AS preview,last_message.created_at AS updated_at,last_message.sequence AS latest_sequence,
        coalesce(last_message.sender <> p_user_id,false) AS needs_reply
      FROM contact_requests r JOIN contact_network_profiles p ON p.id = CASE WHEN r.sender = p_user_id THEN r.recipient ELSE r.sender END
      LEFT JOIN contact_handles h ON h.user_id = p.id
      LEFT JOIN LATERAL (
        SELECT * FROM contact_messages m WHERE LEAST(m.sender,m.recipient) = LEAST(p_user_id,p.id)
          AND GREATEST(m.sender,m.recipient) = GREATEST(p_user_id,p.id) ORDER BY sequence DESC LIMIT 1
      ) last_message ON true
      WHERE (r.sender = p_user_id OR r.recipient = p_user_id) AND r.status = 'accepted'
      ORDER BY p.id
    ) c;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.contact_messaging(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_messaging(uuid,text,jsonb) TO service_role;

-- Accepting a meeting is mutual consent to connect. Resolve auth IDs to registry IDs.
CREATE FUNCTION public.connect_accepted_meeting(p_requester uuid, p_speaker text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE requester uuid; speaker uuid;
BEGIN
  SELECT id INTO requester FROM public."user" WHERE deleted_at IS NULL
    AND (provider_ids->>'supabase' = p_requester::text OR auth_user_id = p_requester::text) LIMIT 1;
  SELECT u.id INTO speaker FROM public."user" u JOIN bsl_speakers s
    ON (u.provider_ids->>'supabase' = s.user_id::text OR u.auth_user_id = s.user_id::text)
    WHERE (s.id::text = p_speaker OR s.user_id::text = p_speaker) AND u.deleted_at IS NULL LIMIT 1;
  IF requester IS NULL OR speaker IS NULL OR requester = speaker THEN RETURN; END IF;
  INSERT INTO contact_profiles(id,name,identity_mode)
    SELECT id,left(coalesce(nullif(full_name,''),'HASHPASS member'),80), CASE WHEN id = speaker THEN 'speaker' ELSE 'attendee' END FROM public."user" WHERE id IN (requester,speaker)
    ON CONFLICT DO NOTHING;
  INSERT INTO contact_requests(sender,recipient,status) VALUES(requester,speaker,'accepted')
    ON CONFLICT (LEAST(sender,recipient), GREATEST(sender,recipient)) DO UPDATE SET status = 'accepted';
END $$;
REVOKE ALL ON FUNCTION public.connect_accepted_meeting(uuid,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.connect_on_meeting_acceptance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status::text = 'accepted' THEN
    PERFORM connect_accepted_meeting(NEW.requester_id,NEW.speaker_id::text);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.connect_on_meeting_acceptance() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER meeting_acceptance_connects_contacts AFTER INSERT OR UPDATE OF status ON public.meeting_requests
  FOR EACH ROW EXECUTE FUNCTION public.connect_on_meeting_acceptance();
SELECT public.connect_accepted_meeting(requester_id,speaker_id::text) FROM public.meeting_requests WHERE status::text = 'accepted';
COMMIT;
