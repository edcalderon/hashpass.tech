-- Scalable admin pass listing and auth-user picker. Identity data stays behind
-- event-admin authorization and SECURITY DEFINER functions.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_passes_event_status_created_id
  ON public.passes(event_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower
  ON auth.users(lower(email));

CREATE OR REPLACE FUNCTION public.admin_list_event_passes(
  p_actor_user_id uuid, p_event_id text, p_limit integer DEFAULT 50, p_cursor text DEFAULT NULL
)
RETURNS TABLE (
  id text, user_id text, event_id text, pass_type text, status text,
  pass_number text, max_meeting_requests integer, used_meeting_requests integer,
  max_boost_amount integer, used_boost_amount integer, created_at timestamptz,
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
    p.max_boost_amount, p.used_boost_amount, p.created_at, p.updated_at,
    u.email::text,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')::text,
    u.raw_user_meta_data->>'username'
  FROM public.passes p JOIN auth.users u ON u.id::text = p.user_id::text
  WHERE p.event_id = p_event_id AND p.status = 'active'
    AND (p_cursor IS NULL OR (p.created_at, p.id) < (
      SELECT pc.created_at, pc.id FROM public.passes pc WHERE pc.id = p_cursor
    ))
  ORDER BY p.created_at DESC, p.id DESC LIMIT LEAST(GREATEST(p_limit, 1), 100) + 1;
END $$;

CREATE OR REPLACE FUNCTION public.admin_search_active_users(
  p_actor_user_id uuid, p_event_id text, p_query text DEFAULT '',
  p_limit integer DEFAULT 25, p_cursor uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, email text, name text, username text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_query text := lower(trim(COALESCE(p_query, '')));
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')::text,
    (u.raw_user_meta_data->>'username')::text, u.created_at
  FROM auth.users u
  WHERE u.deleted_at IS NULL AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
    AND (p_cursor IS NULL OR u.id > p_cursor)
    AND (v_query = '' OR u.id::text = v_query OR lower(COALESCE(u.email, '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'username', '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')) LIKE '%' || v_query || '%')
  ORDER BY u.id LIMIT LEAST(GREATEST(p_limit, 1), 50) + 1;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_event_passes(uuid,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_search_active_users(uuid,text,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_event_passes(uuid,text,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_active_users(uuid,text,text,integer,uuid) TO service_role;
COMMIT;
