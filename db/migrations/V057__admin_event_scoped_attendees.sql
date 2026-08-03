-- admin_search_active_users (V041) intentionally searches all confirmed
-- auth.users platform-wide and only uses p_event_id for the actor's own
-- authorization check — that's correct for its existing callers (global user
-- search for role grants). It is the wrong tool for resolving "attendees of
-- event X": it has no join against event registration and caps results at
-- 51, so admin matchmaking/email campaigns could target unrelated accounts
-- from other events while missing most of the real audience.
--
-- This adds a purpose-built, fully paginated resolver scoped through the
-- passes table (the actual event-membership relation) for those two callers.
CREATE OR REPLACE FUNCTION public.admin_list_event_attendees(
  p_actor_user_id uuid,
  p_event_id text,
  p_query text DEFAULT '',
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid, email text, name text, username text, ticket_type text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp AS $$
DECLARE v_query text := lower(trim(COALESCE(p_query, '')));
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')::text,
    (u.raw_user_meta_data->>'username')::text,
    ep.pass_type, u.created_at
  FROM (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.pass_type::text AS pass_type
    FROM public.passes p
    WHERE p.event_id = p_event_id
    ORDER BY p.user_id, p.created_at DESC
  ) ep
  JOIN auth.users u ON u.id::text = ep.user_id::text
  WHERE u.deleted_at IS NULL
    AND (p_cursor IS NULL OR u.id > p_cursor)
    AND (v_query = '' OR u.id::text = v_query OR lower(COALESCE(u.email, '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'username', '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')) LIKE '%' || v_query || '%')
  ORDER BY u.id LIMIT LEAST(GREATEST(p_limit, 1), 500) + 1;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_event_attendees(uuid,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_event_attendees(uuid,text,text,uuid,integer) TO service_role;
