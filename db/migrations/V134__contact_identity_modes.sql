-- V134: Keep shared contact cards aligned with the selected attendee or speaker identity.
BEGIN;

ALTER TABLE public.contact_profiles
  ADD COLUMN IF NOT EXISTS identity_mode text NOT NULL DEFAULT 'attendee';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'contact_profiles_identity_mode_check'
  ) THEN
    ALTER TABLE public.contact_profiles
      ADD CONSTRAINT contact_profiles_identity_mode_check
      CHECK (identity_mode IN ('attendee', 'speaker'));
  END IF;
END $$;

CREATE OR REPLACE VIEW public.contact_network_profiles WITH (security_invoker = true) AS
SELECT
  p.id,
  CASE WHEN p.identity_mode = 'speaker' THEN COALESCE(NULLIF(s.name, ''), p.name)
       ELSE COALESCE(NULLIF(a.full_name, ''), p.name) END AS name,
  CASE WHEN p.identity_mode = 'speaker' THEN COALESCE(NULLIF(s.title, ''), p.role)
       ELSE COALESCE(NULLIF(a.title, ''), p.role) END AS role,
  CASE WHEN p.identity_mode = 'speaker' THEN COALESCE(NULLIF(s.company, ''), p.company)
       ELSE COALESCE(NULLIF(a.company, ''), p.company) END AS company,
  p.topics,
  p.discoverable,
  p.leaderboard,
  p.share_id,
  count(r.id)::int AS connections,
  (count(r.id) * 100 + cardinality(p.topics) * 20)::int AS points,
  p.identity_mode,
  CASE WHEN p.identity_mode = 'speaker'
       THEN COALESCE(NULLIF(s.imageurl, ''), NULLIF(s.event_imageurl, ''))
       ELSE NULLIF(a.avatar_url, '') END AS avatar_url
FROM public.contact_profiles p
LEFT JOIN public."user" u ON u.id = p.id
LEFT JOIN public.bsl_speakers s ON s.user_id::text = u.provider_ids->>'supabase'
LEFT JOIN public.user_profiles a ON a.user_id::text = u.provider_ids->>'supabase'
LEFT JOIN public.contact_requests r
  ON (r.sender = p.id OR r.recipient = p.id) AND r.status = 'accepted'
GROUP BY p.id, s.name, s.title, s.company, s.imageurl, s.event_imageurl,
  a.full_name, a.title, a.company, a.avatar_url;

CREATE OR REPLACE FUNCTION public.contact_network(
  p_user_id uuid,
  p_action text,
  p_payload jsonb DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target uuid;
  profile jsonb;
  selected_topics text[];
  identity_mode text;
  resolved_name text;
  resolved_role text;
  resolved_company text;
  result jsonb;
BEGIN
  IF p_action = 'profile' THEN
    profile := p_payload->'profile';
    identity_mode := COALESCE(NULLIF(profile->>'identity_mode', ''), 'attendee');
    IF identity_mode NOT IN ('attendee', 'speaker') THEN
      RAISE EXCEPTION 'Unsupported contact identity' USING ERRCODE = '22023';
    END IF;

    SELECT coalesce(array_agg(value), '{}') INTO selected_topics
      FROM jsonb_array_elements_text(profile->'topics');
    IF cardinality(selected_topics) <> (SELECT count(DISTINCT t) FROM unnest(selected_topics) t) THEN
      RAISE EXCEPTION 'Duplicate topics';
    END IF;

    resolved_name := btrim(COALESCE(profile->>'name', ''));
    resolved_role := btrim(COALESCE(profile->>'role', ''));
    resolved_company := btrim(COALESCE(profile->>'company', ''));
    IF identity_mode = 'speaker' THEN
      SELECT btrim(s.name), btrim(COALESCE(s.title, '')), btrim(COALESCE(s.company, ''))
        INTO resolved_name, resolved_role, resolved_company
        FROM public.bsl_speakers s
        JOIN public."user" u ON u.provider_ids->>'supabase' = s.user_id::text
       WHERE u.id = p_user_id AND s.user_id IS NOT NULL;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A claimed speaker profile is required' USING ERRCODE = '42501';
      END IF;
    END IF;

    INSERT INTO contact_profiles (id, name, role, company, topics, discoverable, leaderboard, identity_mode)
    VALUES (p_user_id, resolved_name, resolved_role, resolved_company, selected_topics,
      (profile->>'discoverable')::boolean, (profile->>'leaderboard')::boolean, identity_mode)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, company = EXCLUDED.company,
      topics = EXCLUDED.topics, discoverable = EXCLUDED.discoverable, leaderboard = EXCLUDED.leaderboard,
      identity_mode = EXCLUDED.identity_mode;
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
COMMENT ON FUNCTION public.contact_network(uuid,text,jsonb) IS 'Server-only Contacts read/write model with explicit attendee or speaker identity sharing.';
COMMIT;
