-- V135: Include the selected identity's public avatar in shared contact cards.
BEGIN;

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

COMMIT;
