-- Global, mutual-consent contacts. Identities use the canonical public.user registry.
-- Tables and RPC are server-only: the API resolves the actor from its verified session.
BEGIN;

CREATE TABLE public.contact_profiles (
  id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  role text NOT NULL DEFAULT '' CHECK (length(role) <= 100),
  company text NOT NULL DEFAULT '' CHECK (length(company) <= 100),
  topics text[] NOT NULL DEFAULT '{}' CHECK (cardinality(topics) <= 5 AND topics <@ ARRAY['AI','Web3','Design','Startups','Payments','DeFi','Infrastructure','Gaming','Policy','Community']::text[]),
  discoverable boolean NOT NULL DEFAULT false,
  leaderboard boolean NOT NULL DEFAULT false,
  share_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE
);

CREATE TABLE public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender uuid NOT NULL REFERENCES public.contact_profiles(id) ON DELETE CASCADE,
  recipient uuid NOT NULL REFERENCES public.contact_profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender <> recipient)
);
-- One lifetime edge per pair. Repeated scans/accepts cannot create duplicate XP.
CREATE UNIQUE INDEX contact_requests_pair ON public.contact_requests (LEAST(sender,recipient), GREATEST(sender,recipient));
CREATE INDEX contact_requests_recipient ON public.contact_requests (recipient, status);
CREATE INDEX contact_requests_sender ON public.contact_requests (sender, status);
ALTER TABLE public.contact_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_profiles, public.contact_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contact_profiles, public.contact_requests TO service_role;

CREATE VIEW public.contact_network_profiles WITH (security_invoker = true) AS
SELECT p.*, count(r.id)::int AS connections,
  (count(r.id) * 100 + cardinality(p.topics) * 20)::int AS points
FROM public.contact_profiles p
LEFT JOIN public.contact_requests r ON (r.sender = p.id OR r.recipient = p.id) AND r.status = 'accepted'
GROUP BY p.id;
REVOKE ALL ON public.contact_network_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contact_network_profiles TO service_role;

CREATE FUNCTION public.contact_network(p_user_id uuid, p_action text, p_payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target uuid;
  profile jsonb;
  selected_topics text[];
  result jsonb;
BEGIN
  IF p_action = 'profile' THEN
    profile := p_payload->'profile';
    SELECT coalesce(array_agg(value), '{}') INTO selected_topics FROM jsonb_array_elements_text(profile->'topics');
    IF cardinality(selected_topics) <> (SELECT count(DISTINCT t) FROM unnest(selected_topics) t) THEN
      RAISE EXCEPTION 'Duplicate topics';
    END IF;
    INSERT INTO contact_profiles (id, name, role, company, topics, discoverable, leaderboard)
    VALUES (p_user_id, btrim(profile->>'name'), btrim(profile->>'role'), btrim(profile->>'company'), selected_topics,
      (profile->>'discoverable')::boolean, (profile->>'leaderboard')::boolean)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, company = EXCLUDED.company,
      topics = EXCLUDED.topics, discoverable = EXCLUDED.discoverable, leaderboard = EXCLUDED.leaderboard;
  ELSIF p_action = 'request' THEN
    SELECT id INTO target FROM contact_profiles WHERE share_id = (p_payload->>'card')::uuid;
    IF target IS NULL OR target = p_user_id OR NOT EXISTS (SELECT 1 FROM contact_profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'Invalid contact request';
    END IF;
    IF (SELECT count(*) FROM contact_requests WHERE sender = p_user_id AND status = 'pending') >= 50 THEN
      RAISE EXCEPTION 'Pending request limit reached';
    END IF;
    IF EXISTS (SELECT 1 FROM contact_requests WHERE LEAST(sender,recipient) = LEAST(p_user_id,target)
      AND GREATEST(sender,recipient) = GREATEST(p_user_id,target) AND status IN ('declined','cancelled')) THEN
      RAISE EXCEPTION 'Request not available';
    END IF;
    INSERT INTO contact_requests (sender, recipient) VALUES (p_user_id, target)
    ON CONFLICT DO NOTHING;
  ELSIF p_action IN ('accept', 'decline', 'cancel') THEN
    UPDATE contact_requests SET status = CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END
    WHERE id = (p_payload->>'requestId')::uuid AND status = 'pending'
      AND CASE WHEN p_action = 'cancel' THEN sender = p_user_id ELSE recipient = p_user_id END;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request not available'; END IF;
  ELSIF p_action <> 'read' THEN
    RAISE EXCEPTION 'Unknown contacts action';
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM contact_network_profiles p WHERE p.id = p_user_id),
    'contacts', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'share_id' ORDER BY p.name, p.id)
      FROM contact_network_profiles p JOIN contact_requests r
      ON ((r.sender = p_user_id AND r.recipient = p.id) OR (r.recipient = p_user_id AND r.sender = p.id)) AND r.status = 'accepted'), '[]'),
    'incoming', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'profile', to_jsonb(p) - 'share_id') ORDER BY r.created_at DESC)
      FROM contact_requests r JOIN contact_network_profiles p ON p.id = r.sender
      WHERE r.recipient = p_user_id AND r.status = 'pending'), '[]'),
    'outgoing', coalesce((SELECT jsonb_agg(r.recipient) FROM contact_requests r WHERE r.sender = p_user_id AND r.status = 'pending'), '[]'),
    'suggestions', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT p.* FROM contact_network_profiles p JOIN contact_profiles me ON me.id = p_user_id
      WHERE p.discoverable AND p.id <> p_user_id AND p.topics && me.topics
        AND NOT EXISTS (SELECT 1 FROM contact_requests r WHERE LEAST(r.sender,r.recipient) = LEAST(p.id,p_user_id) AND GREATEST(r.sender,r.recipient) = GREATEST(p.id,p_user_id))
      ORDER BY cardinality(ARRAY(SELECT unnest(p.topics) INTERSECT SELECT unnest(me.topics))) DESC, p.id LIMIT 30
    ) p), '[]'),
    'leaderboard', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'share_id' ORDER BY p.points DESC, p.id) FROM (
      SELECT * FROM contact_network_profiles WHERE leaderboard AND points > 0 ORDER BY points DESC, id LIMIT 20
    ) p), '[]'),
    'shared', (SELECT to_jsonb(p) FROM contact_network_profiles p WHERE p.share_id = nullif(p_payload->>'card', '')::uuid)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.contact_network(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contact_network(uuid,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.contact_network(uuid,text,jsonb) IS 'Server-only Contacts read/write model. Never expose actor selection to clients. Network XP is not wallet HashPoints.';
COMMIT;
