-- ============================================================================
-- V006: Public Users Registry
-- ============================================================================
-- Canonical user registry that stays independent from the auth vendor.
-- Mirrors Supabase auth.users automatically and accepts service-role upserts
-- from other auth flows.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  auth_provider text NOT NULL DEFAULT 'supabase',
  auth_user_id text,
  provider_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_name text,
  last_name text,
  full_name text,
  avatar_url text,
  phone text,
  role text NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'active',
  auth_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  profile_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_verified_at timestamptz,
  last_sign_in_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
  CONSTRAINT users_auth_user_id_not_blank CHECK (auth_user_id IS NULL OR btrim(auth_user_id) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized ON public.users (email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_identity ON public.users (auth_provider, auth_user_id) WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_public_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_public_user_registry(p_payload jsonb)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_provider text := NULLIF(btrim(COALESCE(v_payload->>'auth_provider', v_payload->>'provider', 'supabase')), '');
  v_auth_user_id text := NULLIF(btrim(COALESCE(v_payload->>'auth_user_id', '')), '');
  v_email text := NULLIF(btrim(COALESCE(v_payload->>'email', '')), '');
  v_email_normalized text;
  v_first_name text := NULLIF(btrim(COALESCE(v_payload->>'first_name', '')), '');
  v_last_name text := NULLIF(btrim(COALESCE(v_payload->>'last_name', '')), '');
  v_full_name text := NULLIF(btrim(COALESCE(v_payload->>'full_name', '')), '');
  v_avatar_url text := NULLIF(btrim(COALESCE(v_payload->>'avatar_url', '')), '');
  v_phone text := NULLIF(btrim(COALESCE(v_payload->>'phone', '')), '');
  v_role text := NULLIF(btrim(COALESCE(v_payload->>'role', 'user')), '');
  v_status text := NULLIF(btrim(COALESCE(v_payload->>'status', 'active')), '');
  v_email_verified_at timestamptz := NULLIF(COALESCE(v_payload->>'email_verified_at', ''), '')::timestamptz;
  v_last_sign_in_at timestamptz := NULLIF(COALESCE(v_payload->>'last_sign_in_at', ''), '')::timestamptz;
  v_deleted_at timestamptz := NULLIF(COALESCE(v_payload->>'deleted_at', ''), '')::timestamptz;
  v_auth_metadata jsonb := COALESCE(v_payload->'auth_metadata', '{}'::jsonb);
  v_profile_metadata jsonb := COALESCE(v_payload->'profile_metadata', '{}'::jsonb);
  v_provider_ids jsonb := COALESCE(v_payload->'provider_ids', '{}'::jsonb);
  v_existing public.users%ROWTYPE;
  v_result public.users%ROWTYPE;
  v_merged_provider_ids jsonb;
BEGIN
  IF v_provider IS NULL THEN
    v_provider := 'supabase';
  END IF;

  IF v_email IS NULL THEN
    v_email := v_provider || ':' || COALESCE(v_auth_user_id, encode(gen_random_bytes(6), 'hex')) || '@auth.local';
  END IF;

  v_email_normalized := lower(btrim(v_email));
  v_full_name := NULLIF(btrim(COALESCE(v_full_name, concat_ws(' ', v_first_name, v_last_name))), '');
  v_merged_provider_ids := COALESCE(v_provider_ids, '{}'::jsonb);

  IF v_provider IS NOT NULL THEN
    v_merged_provider_ids := v_merged_provider_ids || jsonb_build_object(v_provider, COALESCE(v_auth_user_id, v_email));
  END IF;

  SELECT *
  INTO v_existing
  FROM public.users
  WHERE (v_auth_user_id IS NOT NULL AND auth_provider = v_provider AND auth_user_id = v_auth_user_id)
     OR email_normalized = v_email_normalized
  ORDER BY
    CASE WHEN v_auth_user_id IS NOT NULL AND auth_provider = v_provider AND auth_user_id = v_auth_user_id THEN 0 ELSE 1 END,
    updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.users
    SET
      email = v_email,
      auth_provider = v_provider,
      auth_user_id = COALESCE(v_auth_user_id, auth_user_id),
      provider_ids = COALESCE(provider_ids, '{}'::jsonb) || v_merged_provider_ids,
      first_name = COALESCE(v_first_name, first_name),
      last_name = COALESCE(v_last_name, last_name),
      full_name = COALESCE(v_full_name, full_name, NULLIF(btrim(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, '')), '')),
      avatar_url = COALESCE(v_avatar_url, avatar_url),
      phone = COALESCE(v_phone, phone),
      role = COALESCE(v_role, role, 'user'),
      status = COALESCE(v_status, status, 'active'),
      auth_metadata = COALESCE(auth_metadata, '{}'::jsonb) || v_auth_metadata,
      profile_metadata = COALESCE(profile_metadata, '{}'::jsonb) || v_profile_metadata,
      email_verified_at = COALESCE(v_email_verified_at, email_verified_at),
      last_sign_in_at = COALESCE(v_last_sign_in_at, last_sign_in_at),
      deleted_at = v_deleted_at
    WHERE id = v_existing.id
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  BEGIN
    INSERT INTO public.users (
      email,
      auth_provider,
      auth_user_id,
      provider_ids,
      first_name,
      last_name,
      full_name,
      avatar_url,
      phone,
      role,
      status,
      auth_metadata,
      profile_metadata,
      email_verified_at,
      last_sign_in_at,
      deleted_at
    )
    VALUES (
      v_email,
      v_provider,
      v_auth_user_id,
      v_merged_provider_ids,
      v_first_name,
      v_last_name,
      v_full_name,
      v_avatar_url,
      v_phone,
      v_role,
      v_status,
      v_auth_metadata,
      v_profile_metadata,
      v_email_verified_at,
      v_last_sign_in_at,
      v_deleted_at
    )
    RETURNING * INTO v_result;

    RETURN v_result;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_existing
      FROM public.users
      WHERE (v_auth_user_id IS NOT NULL AND auth_provider = v_provider AND auth_user_id = v_auth_user_id)
         OR email_normalized = v_email_normalized
      ORDER BY
        CASE WHEN v_auth_user_id IS NOT NULL AND auth_provider = v_provider AND auth_user_id = v_auth_user_id THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.users
        SET
          email = v_email,
          auth_provider = v_provider,
          auth_user_id = COALESCE(v_auth_user_id, auth_user_id),
          provider_ids = COALESCE(provider_ids, '{}'::jsonb) || v_merged_provider_ids,
          first_name = COALESCE(v_first_name, first_name),
          last_name = COALESCE(v_last_name, last_name),
          full_name = COALESCE(v_full_name, full_name, NULLIF(btrim(COALESCE(v_first_name, '') || ' ' || COALESCE(v_last_name, '')), '')),
          avatar_url = COALESCE(v_avatar_url, avatar_url),
          phone = COALESCE(v_phone, phone),
          role = COALESCE(v_role, role, 'user'),
          status = COALESCE(v_status, status, 'active'),
          auth_metadata = COALESCE(auth_metadata, '{}'::jsonb) || v_auth_metadata,
          profile_metadata = COALESCE(profile_metadata, '{}'::jsonb) || v_profile_metadata,
          email_verified_at = COALESCE(v_email_verified_at, email_verified_at),
          last_sign_in_at = COALESCE(v_last_sign_in_at, last_sign_in_at),
          deleted_at = v_deleted_at
        WHERE id = v_existing.id
        RETURNING * INTO v_result;

        RETURN v_result;
      END IF;

      RAISE;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_public_user_registry_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_payload := jsonb_build_object(
      'provider', 'supabase',
      'auth_provider', 'supabase',
      'auth_user_id', OLD.id::text,
      'email', COALESCE(OLD.email, ''),
      'first_name', COALESCE(OLD.raw_user_meta_data->>'first_name', ''),
      'last_name', COALESCE(OLD.raw_user_meta_data->>'last_name', ''),
      'full_name', COALESCE(OLD.raw_user_meta_data->>'full_name', ''),
      'avatar_url', COALESCE(OLD.raw_user_meta_data->>'avatar_url', OLD.raw_user_meta_data->>'picture', ''),
      'phone', COALESCE(OLD.phone, ''),
      'role', COALESCE(OLD.role, 'user'),
      'status', 'deleted',
      'auth_metadata', COALESCE(OLD.raw_app_meta_data, '{}'::jsonb),
      'profile_metadata', COALESCE(OLD.raw_user_meta_data, '{}'::jsonb),
      'email_verified_at', COALESCE(OLD.email_confirmed_at, OLD.confirmed_at)::text,
      'last_sign_in_at', COALESCE(OLD.last_sign_in_at, now())::text,
      'deleted_at', now()::text,
      'provider_ids', jsonb_build_object('supabase', OLD.id::text)
    );
    PERFORM public.upsert_public_user_registry(v_payload);
    RETURN OLD;
  END IF;

  v_payload := jsonb_build_object(
    'provider', 'supabase',
    'auth_provider', 'supabase',
    'auth_user_id', NEW.id::text,
    'email', COALESCE(NEW.email, ''),
    'first_name', COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    'last_name', COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    'full_name', COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'avatar_url', COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'phone', COALESCE(NEW.phone, ''),
    'role', COALESCE(NEW.role, 'user'),
    'status', COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'status', ''),
      CASE WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active' ELSE 'pending' END,
      'active'
    ),
    'auth_metadata', COALESCE(NEW.raw_app_meta_data, '{}'::jsonb),
    'profile_metadata', COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
    'email_verified_at', COALESCE(NEW.email_confirmed_at, NEW.confirmed_at)::text,
    'last_sign_in_at', NEW.last_sign_in_at::text,
    'deleted_at', NULL,
    'provider_ids', jsonb_build_object('supabase', NEW.id::text)
  );
  PERFORM public.upsert_public_user_registry(v_payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_users_updated_at ON public.users;
CREATE TRIGGER trg_public_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_public_users_updated_at();

DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auth_users_public_registry ON auth.users;
    CREATE TRIGGER trg_auth_users_public_registry
      AFTER INSERT OR UPDATE OR DELETE ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_public_user_registry_from_auth_user();
  END IF;
END;
$$;

DO $$
DECLARE
  rec record;
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    FOR rec IN
      SELECT
        id,
        email,
        phone,
        role,
        confirmed_at,
        last_sign_in_at,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      FROM auth.users
    LOOP
      PERFORM public.upsert_public_user_registry(
        jsonb_build_object(
          'provider', 'supabase',
          'auth_provider', 'supabase',
          'auth_user_id', rec.id::text,
          'email', COALESCE(rec.email, ''),
          'first_name', COALESCE(rec.raw_user_meta_data->>'first_name', ''),
          'last_name', COALESCE(rec.raw_user_meta_data->>'last_name', ''),
          'full_name', COALESCE(rec.raw_user_meta_data->>'full_name', ''),
          'avatar_url', COALESCE(rec.raw_user_meta_data->>'avatar_url', rec.raw_user_meta_data->>'picture', ''),
          'phone', COALESCE(rec.phone, ''),
          'role', COALESCE(rec.role, 'user'),
          'status', CASE WHEN rec.email_confirmed_at IS NOT NULL THEN 'active' ELSE 'pending' END,
          'auth_metadata', COALESCE(rec.raw_app_meta_data, '{}'::jsonb),
          'profile_metadata', COALESCE(rec.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('auth_created_at', rec.created_at, 'auth_updated_at', rec.updated_at),
          'email_verified_at', COALESCE(rec.email_confirmed_at, rec.confirmed_at)::text,
          'last_sign_in_at', rec.last_sign_in_at::text,
          'deleted_at', NULL,
          'provider_ids', jsonb_build_object('supabase', rec.id::text)
        )
      );
    END LOOP;
  END IF;
END;
$$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT id, user_id, full_name, avatar_url, phone, email, metadata, created_at, updated_at
    FROM public.user_profiles
    WHERE email IS NOT NULL AND btrim(email) <> ''
  LOOP
    PERFORM public.upsert_public_user_registry(
      jsonb_build_object(
        'provider', 'legacy_profile',
        'auth_provider', 'legacy_profile',
        'auth_user_id', rec.user_id,
        'email', rec.email,
        'full_name', COALESCE(rec.full_name, ''),
        'avatar_url', COALESCE(rec.avatar_url, ''),
        'phone', COALESCE(rec.phone, ''),
        'role', COALESCE(rec.metadata->>'role', 'user'),
        'status', COALESCE(rec.metadata->>'status', 'active'),
        'auth_metadata', '{}'::jsonb,
        'profile_metadata', COALESCE(rec.metadata, '{}'::jsonb) || jsonb_build_object('legacy_user_profile_id', rec.id::text, 'legacy_created_at', rec.created_at, 'legacy_updated_at', rec.updated_at),
        'provider_ids', jsonb_build_object('legacy_profile', COALESCE(rec.user_id, rec.email))
      )
    );
  END LOOP;
END;
$$;
