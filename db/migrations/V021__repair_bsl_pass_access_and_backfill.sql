-- ============================================================================
-- V021: Repair BSL pass reads for UUID-backed tenants and reassert entitlements
-- ============================================================================
-- Some BSL tenants retain the portable V003 policies, where a UUID-backed
-- passes.user_id was compared directly with a text-cast identity. PostgreSQL
-- rejects that as `uuid = text`, so authenticated users could not read the
-- Chile/Colombia passes that V010/V011 had already provisioned for them.
--
-- Compare both values as text so this works for the canonical UUID schema and
-- legacy text-backed tenants. Prefer Supabase's JWT identity for browser RLS,
-- retaining the app.user_id context fallback for non-Supabase callers.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS passes_select_own ON public.passes;
CREATE POLICY passes_select_own ON public.passes
  FOR SELECT
  USING (
    user_id::text = COALESCE(auth.uid()::text, public.get_current_user_id()::text)
  );

DROP POLICY IF EXISTS passes_insert_own ON public.passes;
CREATE POLICY passes_insert_own ON public.passes
  FOR INSERT
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, public.get_current_user_id()::text)
  );

DROP POLICY IF EXISTS passes_update_own ON public.passes;
CREATE POLICY passes_update_own ON public.passes
  FOR UPDATE
  USING (
    user_id::text = COALESCE(auth.uid()::text, public.get_current_user_id()::text)
  )
  WITH CHECK (
    user_id::text = COALESCE(auth.uid()::text, public.get_current_user_id()::text)
  );

-- Keep the confirmation trigger explicit so every newly confirmed account
-- receives both upcoming BSL General passes, including accounts created by
-- the Better Auth-to-Supabase bridge.
CREATE OR REPLACE FUNCTION public.provision_upcoming_bsl_general_passes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'chile2026');
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'colombia2026');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_upcoming_bsl_general_passes ON auth.users;
CREATE TRIGGER trg_auth_users_upcoming_bsl_general_passes
  AFTER INSERT OR UPDATE OF email_confirmed_at, confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_upcoming_bsl_general_passes();

-- Idempotently repair every existing confirmed account. The underlying
-- function locks by user/event and returns the existing active General pass.
DO $$
DECLARE
  user_record record;
BEGIN
  FOR user_record IN
    SELECT id
    FROM auth.users
    WHERE email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL
  LOOP
    PERFORM public.create_upcoming_bsl_general_pass_for_user(user_record.id, 'chile2026');
    PERFORM public.create_upcoming_bsl_general_pass_for_user(user_record.id, 'colombia2026');
  END LOOP;
END;
$$;

COMMIT;
