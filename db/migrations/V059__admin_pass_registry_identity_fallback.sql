-- Keep administrative pass listings visible for every supported auth provider.
-- Older and non-Supabase accounts store passes.user_id as the canonical public
-- users id (or provider id), so an inner join to auth.users silently hid those
-- passes from the admin panel.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_list_event_passes(
  p_actor_user_id uuid, p_event_id text, p_limit integer DEFAULT 50, p_cursor text DEFAULT NULL
)
RETURNS TABLE (
  id text, user_id text, event_id text, pass_type text, status text,
  pass_number text, max_meeting_requests integer, used_meeting_requests integer,
  max_boost_amount numeric, used_boost_amount numeric, created_at timestamptz,
  updated_at timestamptz, user_email text, user_name text, username text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.user_id, p.event_id, p.pass_type::text, p.status::text,
    p.pass_number, p.max_meeting_requests, p.used_meeting_requests,
    p.max_boost_amount::numeric, p.used_boost_amount::numeric, p.created_at, p.updated_at,
    COALESCE(auth_user.email::text, registry.email, profile.email),
    COALESCE(
      auth_user.raw_user_meta_data->>'name',
      auth_user.raw_user_meta_data->>'full_name',
      registry.full_name,
      NULLIF(concat_ws(' ', profile.full_name, profile.display_name), '')
    ),
    COALESCE(auth_user.raw_user_meta_data->>'username', registry.profile_metadata->>'username')
  FROM public.passes p
  LEFT JOIN auth.users auth_user ON auth_user.id::text = p.user_id::text
  LEFT JOIN LATERAL (
    SELECT u.*
    FROM public.users u
    WHERE u.id::text = p.user_id::text
       OR u.auth_user_id::text = p.user_id::text
       OR u.provider_ids @> jsonb_build_object('supabase', p.user_id::text)
    ORDER BY (u.id::text = p.user_id::text) DESC, u.updated_at DESC
    LIMIT 1
  ) registry ON true
  LEFT JOIN LATERAL (
    SELECT up.*
    FROM public.user_profiles up
    WHERE up.user_id::text = p.user_id::text
       OR up.user_id::text = registry.auth_user_id::text
    ORDER BY up.updated_at DESC
    LIMIT 1
  ) profile ON true
  WHERE p.event_id = p_event_id
    AND (p_cursor IS NULL OR (p.created_at, p.id) < (
      SELECT pc.created_at, pc.id FROM public.passes pc WHERE pc.id = p_cursor
    ))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) + 1;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_event_passes(uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_event_passes(uuid,text,integer,text) TO service_role;
COMMIT;
