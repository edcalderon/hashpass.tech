-- ============================================================================
-- V016: Expire global roles in event-admin authorization
-- ============================================================================
-- Keep the event-admin RPC aligned with is_admin() and is_super_admin(): a
-- global admin/super-admin grant is valid only while expires_at is null or in
-- the future. Without this, an expired global role can still administer any
-- event through service-role API routes that call has_event_admin_access().
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.has_event_admin_access(
  p_user_id uuid,
  p_event_id text,
  p_include_moderator boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) OR EXISTS (
    SELECT 1 FROM public.event_roles er
    WHERE er.user_id = p_user_id
      AND er.event_id = p_event_id
      AND (er.expires_at IS NULL OR er.expires_at > now())
      AND (er.role = 'event_admin'::public.event_role OR (p_include_moderator AND er.role = 'moderator'::public.event_role))
  );
$$;

REVOKE ALL ON FUNCTION public.has_event_admin_access(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_event_admin_access(uuid, text, boolean) TO authenticated, service_role;

COMMIT;
