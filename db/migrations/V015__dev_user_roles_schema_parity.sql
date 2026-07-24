-- ============================================================================
-- V015: Reconcile a diverged dev `user_roles` schema back to the V001/V003
-- baseline that prod already has
-- ============================================================================
-- Confirmed live 2026-07-24: dev's `user_roles` table predates/diverges from
-- this repo's tracked migrations — `role` was a plain `text` column (the
-- `user_role` enum type didn't exist on dev at all), `granted_by`/
-- `granted_at`/`expires_at`/`metadata` were missing entirely, and neither
-- `is_admin()` nor `get_current_user_id()` existed. V012's
-- `has_event_admin_access` and V014's `is_super_admin` both cast against
-- `public.user_role`, so V012 failed outright on dev with
-- "type public.user_role does not exist" (transaction rolled back cleanly,
-- no partial damage) before this migration existed.
--
-- Every step here is guarded so this is a safe no-op on prod, which already
-- has the full shape (confirmed: enum exists with all 5 labels, is_admin()/
-- get_current_user_id() exist, passes_admin_all/roles_admin_all policies
-- exist). dev's `user_roles` had 0 rows at the time this was written, so the
-- text->enum column conversion has no data to fail on.
-- ============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user', 'speaker', 'organizer', 'admin', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS granted_by uuid,
  ADD COLUMN IF NOT EXISTS granted_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

DO $$
DECLARE
  v_udt_name text;
BEGIN
  SELECT udt_name INTO v_udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role';

  IF v_udt_name = 'text' THEN
    ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.user_role USING role::public.user_role;
    ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'user'::public.user_role;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
    AND role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
    AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Admin-bypass policies from V003. Additive alongside whatever self-service
-- policies already exist on dev under different names — RLS permissive
-- policies are OR'd, so this cannot take away access, only add the
-- global-admin bypass dev was missing.
DROP POLICY IF EXISTS passes_admin_all ON public.passes;
CREATE POLICY passes_admin_all ON public.passes
  FOR ALL
  USING (public.is_admin(public.get_current_user_id()));

DROP POLICY IF EXISTS roles_admin_all ON public.user_roles;
CREATE POLICY roles_admin_all ON public.user_roles
  FOR ALL
  USING (public.is_admin(public.get_current_user_id()));

COMMIT;
