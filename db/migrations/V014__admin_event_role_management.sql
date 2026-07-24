-- ============================================================================
-- V014: Privileged event_admin/moderator grant + revoke
-- ============================================================================
-- Closes the "no way to grant event_roles except a raw DB insert" gap noted
-- in V012/V013 follow-up. Mirrors admin_mutate_event_pass's shape: a single
-- SECURITY DEFINER RPC, service_role-only, that authorizes itself and writes
-- an admin_action_log row, called from /api/admin/roles.
--
-- Escalation rule (per task decisions): only a global super_admin may grant
-- or revoke event_admin. moderator may be granted/revoked by a super_admin
-- OR that event's own event_admin — but never by a moderator.
--
-- Also adds the FK that user_roles already has but event_roles was missing:
-- confirmed live 2026-07-24 that granting a role to an id with no auth.users
-- row fails loudly for user_roles (FK violation) but would have silently
-- succeeded, and been functionally inert, for event_roles.
-- ============================================================================

BEGIN;

DO $$ BEGIN
  ALTER TABLE public.event_roles
    ADD CONSTRAINT event_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'super_admin'::public.user_role
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mutate_event_role(
  p_actor_user_id uuid,
  p_event_id text,
  p_action text,
  p_target_user_id uuid,
  p_role text,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  IF p_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Unsupported role action' USING ERRCODE = '22023';
  END IF;
  IF p_role NOT IN ('event_admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Unknown event' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
  END IF;

  v_is_super := public.is_super_admin(p_actor_user_id);

  IF p_role = 'event_admin' THEN
    IF NOT v_is_super THEN
      RAISE EXCEPTION 'Only a super admin may grant or revoke event_admin' USING ERRCODE = '42501';
    END IF;
  ELSE -- moderator
    IF NOT (v_is_super OR public.has_event_admin_access(p_actor_user_id, p_event_id, false)) THEN
      RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'grant' THEN
    INSERT INTO public.event_roles (event_id, user_id, role, granted_by, expires_at)
    VALUES (p_event_id, p_target_user_id, p_role::public.event_role, p_actor_user_id, p_expires_at)
    ON CONFLICT (event_id, user_id, role) DO UPDATE
      SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_at = EXCLUDED.expires_at;
  ELSE
    DELETE FROM public.event_roles
    WHERE event_id = p_event_id AND user_id = p_target_user_id AND role = p_role::public.event_role;
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (p_actor_user_id, p_event_id, 'role.' || p_action, 'event_role', p_target_user_id::text,
    jsonb_build_object('role', p_role, 'expires_at', p_expires_at));

  RETURN jsonb_build_object('event_id', p_event_id, 'user_id', p_target_user_id, 'role', p_role, 'action', p_action);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_mutate_event_role(uuid, text, text, uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mutate_event_role(uuid, text, text, uuid, text, timestamptz)
  TO service_role;

COMMIT;
