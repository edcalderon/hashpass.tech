-- ============================================================================
-- V006: Rename public.users → public.user (SQL singular naming standard)
--       + Add FK constraints from user_* tables → auth.users(id)
-- ============================================================================
-- SQL naming standard uses singular nouns (user, not users; product, not products).
-- The canonical registry table created in V004 was incorrectly named users.
-- This migration renames it to user and recreates all dependent objects.
--
-- Better Auth's internal table stays as ba_users (ba_ prefix distinguishes it
-- from the canonical public.user registry).
--
-- FK relations added:
--   user_profiles.user_id  (text → cast to uuid) → auth.users(id)
--   user_balances.user_id  (uuid)                → auth.users(id)
--   user_roles.user_id     (uuid)                → auth.users(id)
--   user_transactions.user_id (uuid)             → auth.users(id)
--   user_blocks.blocker_id (uuid)                → auth.users(id)
--   user_blocks.blocked_id (uuid)                → auth.users(id)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Rename public.users → public.user
-- ============================================================================

ALTER TABLE public.users RENAME TO "user";

-- Rename indexes
ALTER INDEX IF EXISTS idx_users_email        RENAME TO idx_user_email;
ALTER INDEX IF EXISTS idx_users_auth_user_id RENAME TO idx_user_auth_user_id;
ALTER INDEX IF EXISTS idx_users_status       RENAME TO idx_user_status;
ALTER INDEX IF EXISTS idx_users_provider     RENAME TO idx_user_provider;

-- ============================================================================
-- 2. Recreate the updated_at trigger pointing to the renamed table
-- ============================================================================

DROP TRIGGER IF EXISTS trg_users_updated_at ON public."user";
CREATE TRIGGER trg_user_updated_at
  BEFORE UPDATE ON public."user"
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- ============================================================================
-- 3. Recreate upsert_public_user_registry — now targets public.user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_public_user_registry(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email              text;
  v_provider           text;
  v_auth_provider      text;
  v_auth_user_id       text;
  v_first_name         text;
  v_last_name          text;
  v_full_name          text;
  v_avatar_url         text;
  v_phone              text;
  v_role               text;
  v_status             text;
  v_email_verified_at  timestamptz;
  v_last_sign_in_at    timestamptz;
  v_deleted_at         timestamptz;
  v_auth_metadata      jsonb;
  v_profile_metadata   jsonb;
  v_provider_ids       jsonb;
  v_existing_ids       jsonb;
  v_merged_ids         jsonb;
  v_result_id          uuid;
BEGIN
  v_email             := lower(trim(p_payload->>'email'));
  v_provider          := coalesce(nullif(trim(p_payload->>'provider'), ''), 'email');
  v_auth_provider     := coalesce(nullif(trim(p_payload->>'auth_provider'), ''), v_provider);
  v_auth_user_id      := nullif(trim(p_payload->>'auth_user_id'), '');
  v_first_name        := nullif(trim(p_payload->>'first_name'), '');
  v_last_name         := nullif(trim(p_payload->>'last_name'), '');
  v_full_name         := nullif(trim(p_payload->>'full_name'), '');
  v_avatar_url        := nullif(trim(p_payload->>'avatar_url'), '');
  v_phone             := nullif(trim(p_payload->>'phone'), '');
  v_role              := coalesce(nullif(trim(p_payload->>'role'), ''), 'user');
  v_status            := coalesce(nullif(trim(p_payload->>'status'), ''), 'active');
  v_auth_metadata     := coalesce(p_payload->'auth_metadata', '{}');
  v_profile_metadata  := coalesce(p_payload->'profile_metadata', '{}');
  v_provider_ids      := coalesce(p_payload->'provider_ids', '{}');

  BEGIN
    v_email_verified_at := (p_payload->>'email_verified_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_email_verified_at := NULL; END;
  BEGIN
    v_last_sign_in_at := (p_payload->>'last_sign_in_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_last_sign_in_at := NULL; END;
  BEGIN
    v_deleted_at := (p_payload->>'deleted_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_deleted_at := NULL; END;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'upsert_public_user_registry: email is required';
  END IF;

  SELECT provider_ids INTO v_existing_ids
  FROM public."user" WHERE email = v_email;

  v_merged_ids := coalesce(v_existing_ids, '{}') || v_provider_ids;

  INSERT INTO public."user" (
    email, provider, auth_provider, auth_user_id,
    first_name, last_name, full_name, avatar_url, phone,
    role, status, email_verified_at, last_sign_in_at, deleted_at,
    auth_metadata, profile_metadata, provider_ids
  ) VALUES (
    v_email, v_provider, v_auth_provider, v_auth_user_id,
    v_first_name, v_last_name, v_full_name, v_avatar_url, v_phone,
    v_role, v_status, v_email_verified_at, v_last_sign_in_at, v_deleted_at,
    v_auth_metadata, v_profile_metadata, v_merged_ids
  )
  ON CONFLICT (email) DO UPDATE SET
    provider          = CASE WHEN public."user".provider IN ('email','unknown') THEN EXCLUDED.provider ELSE public."user".provider END,
    auth_provider     = EXCLUDED.auth_provider,
    auth_user_id      = coalesce(EXCLUDED.auth_user_id, public."user".auth_user_id),
    first_name        = coalesce(EXCLUDED.first_name, public."user".first_name),
    last_name         = coalesce(EXCLUDED.last_name, public."user".last_name),
    full_name         = coalesce(EXCLUDED.full_name, public."user".full_name),
    avatar_url        = coalesce(EXCLUDED.avatar_url, public."user".avatar_url),
    phone             = coalesce(EXCLUDED.phone, public."user".phone),
    role              = CASE
                          WHEN EXCLUDED.role IN ('admin','super_admin','organizer','speaker') THEN EXCLUDED.role
                          ELSE coalesce(public."user".role, EXCLUDED.role)
                        END,
    status            = CASE
                          WHEN EXCLUDED.status = 'deleted' THEN 'deleted'
                          WHEN public."user".status = 'deleted' THEN 'deleted'
                          ELSE EXCLUDED.status
                        END,
    email_verified_at = coalesce(EXCLUDED.email_verified_at, public."user".email_verified_at),
    last_sign_in_at   = coalesce(EXCLUDED.last_sign_in_at, public."user".last_sign_in_at),
    deleted_at        = EXCLUDED.deleted_at,
    auth_metadata     = public."user".auth_metadata  || EXCLUDED.auth_metadata,
    profile_metadata  = public."user".profile_metadata || EXCLUDED.profile_metadata,
    provider_ids      = v_merged_ids,
    updated_at        = now()
  RETURNING id INTO v_result_id;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;

-- ============================================================================
-- 4. Recreate auth.users sync trigger function targeting public.user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public_users()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_provider   text;
  v_full_name  text;
  v_avatar_url text;
  v_payload    jsonb;
BEGIN
  v_provider  := coalesce(NEW.raw_app_meta_data->>'provider', 'email');
  v_full_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    trim(coalesce(NEW.raw_user_meta_data->>'first_name','') || ' ' ||
         coalesce(NEW.raw_user_meta_data->>'last_name',''))
  );
  v_avatar_url := coalesce(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  v_payload := jsonb_build_object(
    'provider',          v_provider,
    'auth_provider',     v_provider,
    'auth_user_id',      NEW.id::text,
    'email',             lower(coalesce(NEW.email, '')),
    'first_name',        NEW.raw_user_meta_data->>'first_name',
    'last_name',         NEW.raw_user_meta_data->>'last_name',
    'full_name',         nullif(trim(v_full_name), ''),
    'avatar_url',        v_avatar_url,
    'phone',             NEW.phone,
    'role',              'user',
    'status',            'active',
    'email_verified_at', NEW.email_confirmed_at,
    'last_sign_in_at',   NEW.last_sign_in_at,
    'deleted_at',        NULL,
    'auth_metadata',     coalesce(NEW.raw_app_meta_data, '{}'),
    'profile_metadata',  coalesce(NEW.raw_user_meta_data, '{}'),
    'provider_ids',      jsonb_build_object(v_provider, NEW.id::text, 'supabase', NEW.id::text)
  );

  IF NEW.email IS NULL OR trim(NEW.email) = '' THEN RETURN NEW; END IF;
  PERFORM public.upsert_public_user_registry(v_payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public."user"
  SET status = 'deleted', deleted_at = now(), updated_at = now()
  WHERE auth_user_id = OLD.id::text
     OR email = lower(coalesce(OLD.email, ''));
  RETURN OLD;
END;
$$;

-- ============================================================================
-- 5. Update RLS policy (DROP + recreate with new table reference)
-- ============================================================================

DROP POLICY IF EXISTS "users_select_own" ON public."user";
CREATE POLICY "user_select_own" ON public."user"
  FOR SELECT
  USING (
    auth_user_id = auth.uid()::text
    OR email = auth.jwt()->>'email'
  );

-- ============================================================================
-- 6. Add FK constraints: user_profiles.user_id (text) fix + FKs → auth.users
-- ============================================================================

-- Add FK constraints — all wrapped in existence checks so this script is
-- safe to run on both prod (has all tables) and dev (has only some tables).
DO $$
DECLARE
  tbl_exists boolean;
BEGIN

  -- user_profiles: fix user_id text → uuid, then add FK
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_profiles'
  ) INTO tbl_exists;

  IF tbl_exists THEN
    IF (SELECT count(*) FROM public.user_profiles WHERE user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') = 0 THEN
      DROP POLICY IF EXISTS profiles_insert_own ON public.user_profiles;
      DROP POLICY IF EXISTS profiles_update_own ON public.user_profiles;
      DROP POLICY IF EXISTS profiles_select_all ON public.user_profiles;
      ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_id_key;
      ALTER TABLE public.user_profiles ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
      ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);
      CREATE POLICY profiles_select_all ON public.user_profiles FOR SELECT USING (true);
      CREATE POLICY profiles_insert_own ON public.user_profiles FOR INSERT WITH CHECK (user_id = auth.uid());
      CREATE POLICY profiles_update_own ON public.user_profiles FOR UPDATE USING (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='user_profiles_user_id_fkey' AND table_schema='public') THEN
      ALTER TABLE public.user_profiles
        ADD CONSTRAINT user_profiles_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    RAISE NOTICE 'user_profiles FK checked/added';
  END IF;

  -- user_balances
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_balances') INTO tbl_exists;
  IF tbl_exists AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='user_balances_user_id_fkey' AND table_schema='public') THEN
    ALTER TABLE public.user_balances
      ADD CONSTRAINT user_balances_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'user_balances FK added';
  END IF;

  -- user_roles
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles') INTO tbl_exists;
  IF tbl_exists AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='user_roles_user_id_fkey' AND table_schema='public') THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'user_roles FK added';
  END IF;

  -- user_transactions
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_transactions') INTO tbl_exists;
  IF tbl_exists AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='user_transactions_user_id_fkey' AND table_schema='public') THEN
    ALTER TABLE public.user_transactions
      ADD CONSTRAINT user_transactions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'user_transactions FK added';
  END IF;

  -- user_blocks (prod has blocker_id/blocked_id)
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_blocks') INTO tbl_exists;
  IF tbl_exists THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_blocks' AND column_name='blocker_id') THEN
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='user_blocks_blocker_id_fkey' AND table_schema='public') THEN
        ALTER TABLE public.user_blocks
          ADD CONSTRAINT user_blocks_blocker_id_fkey
          FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='user_blocks_blocked_id_fkey' AND table_schema='public') THEN
        ALTER TABLE public.user_blocks
          ADD CONSTRAINT user_blocks_blocked_id_fkey
          FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;
      END IF;
      RAISE NOTICE 'user_blocks FKs checked/added';
    END IF;
  END IF;

END;
$$;

COMMIT;

-- ============================================================================
-- Verify
-- ============================================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_schema='public' AND table_name='user') = 1,
    'public.user table missing';
  RAISE NOTICE 'V006 verification passed: public.user exists';
END;
$$;
