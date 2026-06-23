-- ============================================================================
-- V004: Canonical Public Users Table
-- ============================================================================
-- Creates public.users as the single source of truth for every account in
-- the system, regardless of auth provider (Supabase, Directus, Google OAuth,
-- OTP, magic link, wallet, Better Auth, etc.).
--
-- Design goals:
--   1. Provider-agnostic — no hard dependency on auth.users (Supabase).
--   2. All auth paths replicate here on first sign-in/sign-up.
--   3. Supabase trigger keeps auth.users in sync automatically.
--   4. email is the deduplication key; provider_ids tracks every provider UUID.
--   5. Downstream tables (passes, user_profiles, …) continue using their
--      existing user_id columns — no FK migration needed in this release.
-- ============================================================================

-- ============================================================================
-- 1. Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id                 uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email              text        UNIQUE NOT NULL,

  -- Primary auth provider for this record
  provider           text        NOT NULL DEFAULT 'email',
  auth_provider      text        NOT NULL DEFAULT 'email',

  -- The auth provider's own user ID (Supabase UUID, Directus UUID, etc.)
  auth_user_id       text,

  -- Profile fields
  first_name         text,
  last_name          text,
  full_name          text,
  avatar_url         text,
  phone              text,

  -- Access control
  role               text        NOT NULL DEFAULT 'user',
  status             text        NOT NULL DEFAULT 'active',  -- active | disabled | deleted

  -- Timestamps
  email_verified_at  timestamptz,
  last_sign_in_at    timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Raw metadata blobs (preserved for audit / migration)
  auth_metadata      jsonb       NOT NULL DEFAULT '{}',
  profile_metadata   jsonb       NOT NULL DEFAULT '{}',

  -- Map of provider name → provider-specific user ID
  -- e.g. {"supabase": "uuid-xxx", "directus": "uuid-yyy", "google": "google-sub"}
  provider_ids       jsonb       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_users_email          ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id   ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_status         ON public.users(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_users_provider       ON public.users(provider);

COMMENT ON TABLE public.users IS
  'Canonical user registry. Every account is replicated here regardless of auth provider.';

-- ============================================================================
-- 2. updated_at trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- ============================================================================
-- 3. upsert_public_user_registry — called by all API auth paths
-- ============================================================================
-- Input:  JSONB payload matching PublicUserRegistryPayload in
--         apps/mobile-app/lib/auth/public-user-registry.ts
-- Output: JSONB { id: uuid }
--
-- Deduplication key: email (case-insensitive).
-- On conflict the row is updated; provider_ids is merged (not replaced).

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
  -- Extract and normalise fields
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

  -- Parse optional timestamps safely
  BEGIN
    v_email_verified_at := (p_payload->>'email_verified_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_email_verified_at := NULL;
  END;
  BEGIN
    v_last_sign_in_at := (p_payload->>'last_sign_in_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_last_sign_in_at := NULL;
  END;
  BEGIN
    v_deleted_at := (p_payload->>'deleted_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_deleted_at := NULL;
  END;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'upsert_public_user_registry: email is required';
  END IF;

  -- Merge incoming provider_ids with existing ones (never overwrite with empty)
  SELECT provider_ids INTO v_existing_ids
  FROM public.users WHERE email = v_email;

  v_merged_ids := coalesce(v_existing_ids, '{}') || v_provider_ids;

  -- Upsert on email
  INSERT INTO public.users (
    email,
    provider,
    auth_provider,
    auth_user_id,
    first_name,
    last_name,
    full_name,
    avatar_url,
    phone,
    role,
    status,
    email_verified_at,
    last_sign_in_at,
    deleted_at,
    auth_metadata,
    profile_metadata,
    provider_ids
  ) VALUES (
    v_email,
    v_provider,
    v_auth_provider,
    v_auth_user_id,
    v_first_name,
    v_last_name,
    v_full_name,
    v_avatar_url,
    v_phone,
    v_role,
    v_status,
    v_email_verified_at,
    v_last_sign_in_at,
    v_deleted_at,
    v_auth_metadata,
    v_profile_metadata,
    v_merged_ids
  )
  ON CONFLICT (email) DO UPDATE SET
    -- Never downgrade the provider to a less-specific one if already set
    provider           = CASE
                           WHEN public.users.provider IN ('email', 'unknown') THEN EXCLUDED.provider
                           ELSE public.users.provider
                         END,
    auth_provider      = EXCLUDED.auth_provider,
    auth_user_id       = coalesce(EXCLUDED.auth_user_id, public.users.auth_user_id),
    first_name         = coalesce(EXCLUDED.first_name, public.users.first_name),
    last_name          = coalesce(EXCLUDED.last_name, public.users.last_name),
    full_name          = coalesce(EXCLUDED.full_name, public.users.full_name),
    avatar_url         = coalesce(EXCLUDED.avatar_url, public.users.avatar_url),
    phone              = coalesce(EXCLUDED.phone, public.users.phone),
    role               = CASE
                           WHEN EXCLUDED.role IN ('admin','super_admin','organizer','speaker') THEN EXCLUDED.role
                           ELSE coalesce(public.users.role, EXCLUDED.role)
                         END,
    status             = CASE
                           WHEN EXCLUDED.status = 'deleted' THEN 'deleted'
                           WHEN public.users.status = 'deleted' THEN 'deleted'
                           ELSE EXCLUDED.status
                         END,
    email_verified_at  = coalesce(EXCLUDED.email_verified_at, public.users.email_verified_at),
    last_sign_in_at    = coalesce(EXCLUDED.last_sign_in_at, public.users.last_sign_in_at),
    deleted_at         = EXCLUDED.deleted_at,
    auth_metadata      = public.users.auth_metadata  || EXCLUDED.auth_metadata,
    profile_metadata   = public.users.profile_metadata || EXCLUDED.profile_metadata,
    provider_ids       = v_merged_ids,
    updated_at         = now()
  RETURNING id INTO v_result_id;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;

-- ============================================================================
-- 4. Supabase auth.users → public.users sync trigger
-- ============================================================================
-- Fires on every INSERT / UPDATE of auth.users so new sign-ups (Google,
-- OTP, magic link) are replicated without extra API calls.

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_provider     text;
  v_full_name    text;
  v_avatar_url   text;
  v_payload      jsonb;
BEGIN
  v_provider  := coalesce(NEW.raw_app_meta_data->>'provider', 'email');
  v_full_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    trim(
      coalesce(NEW.raw_user_meta_data->>'first_name','') || ' ' ||
      coalesce(NEW.raw_user_meta_data->>'last_name','')
    )
  );
  v_avatar_url := coalesce(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  v_payload := jsonb_build_object(
    'provider',           v_provider,
    'auth_provider',      v_provider,
    'auth_user_id',       NEW.id::text,
    'email',              lower(coalesce(NEW.email, '')),
    'first_name',         NEW.raw_user_meta_data->>'first_name',
    'last_name',          NEW.raw_user_meta_data->>'last_name',
    'full_name',          nullif(trim(v_full_name), ''),
    'avatar_url',         v_avatar_url,
    'phone',              NEW.phone,
    'role',               'user',
    'status',             'active',
    'email_verified_at',  NEW.email_confirmed_at,
    'last_sign_in_at',    NEW.last_sign_in_at,
    'deleted_at',         NULL,
    'auth_metadata',      coalesce(NEW.raw_app_meta_data, '{}'),
    'profile_metadata',   coalesce(NEW.raw_user_meta_data, '{}'),
    'provider_ids',       jsonb_build_object(v_provider, NEW.id::text, 'supabase', NEW.id::text)
  );

  -- Silently skip if email is missing (should never happen)
  IF NEW.email IS NULL OR trim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  PERFORM public.upsert_public_user_registry(v_payload);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_sync ON auth.users;
CREATE TRIGGER on_auth_user_sync
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_to_public_users();

-- ============================================================================
-- 5. Soft-delete trigger on auth.users DELETE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET status = 'deleted', deleted_at = now(), updated_at = now()
  WHERE auth_user_id = OLD.id::text
     OR email = lower(coalesce(OLD.email, ''));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted();

-- ============================================================================
-- 6. Row Level Security
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own row (matched by auth_user_id or email)
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  USING (
    auth_user_id = auth.uid()::text
    OR email = auth.jwt()->>'email'
  );

-- Service-role bypass is implicit (Supabase grants service role unrestricted access)
-- All writes go through upsert_public_user_registry (SECURITY DEFINER).

-- ============================================================================
-- 7. Backfill existing auth.users into public.users
-- ============================================================================
-- Safe to run repeatedly — upserts are idempotent.

DO $$
DECLARE
  rec record;
  v_payload jsonb;
  v_provider text;
BEGIN
  FOR rec IN SELECT * FROM auth.users LOOP
    v_provider := coalesce(rec.raw_app_meta_data->>'provider', 'email');

    v_payload := jsonb_build_object(
      'provider',         v_provider,
      'auth_provider',    v_provider,
      'auth_user_id',     rec.id::text,
      'email',            lower(coalesce(rec.email, '')),
      'first_name',       rec.raw_user_meta_data->>'first_name',
      'last_name',        rec.raw_user_meta_data->>'last_name',
      'full_name',        coalesce(
                            rec.raw_user_meta_data->>'full_name',
                            rec.raw_user_meta_data->>'name'
                          ),
      'avatar_url',       coalesce(
                            rec.raw_user_meta_data->>'avatar_url',
                            rec.raw_user_meta_data->>'picture'
                          ),
      'phone',            rec.phone,
      'role',             'user',
      'status',           'active',
      'email_verified_at', rec.email_confirmed_at,
      'last_sign_in_at',   rec.last_sign_in_at,
      'deleted_at',        NULL,
      'auth_metadata',     coalesce(rec.raw_app_meta_data, '{}'),
      'profile_metadata',  coalesce(rec.raw_user_meta_data, '{}'),
      'provider_ids',      jsonb_build_object(v_provider, rec.id::text, 'supabase', rec.id::text)
    );

    BEGIN
      PERFORM public.upsert_public_user_registry(v_payload);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill skipped for %: %', rec.email, SQLERRM;
    END;
  END LOOP;
END;
$$;
