-- ============================================================================
-- V005: Rename Better Auth "user" table to "ba_users"
-- ============================================================================
-- Better Auth's internal user table was named "user" (singular), which
-- conflicts with V004's canonical public.users registry.
-- Rename it to ba_users (ba_ = better-auth prefix) to:
--   1. Use proper plural naming.
--   2. Avoid a name collision with public.users.
--   3. Make the table's purpose immediately clear.
--
-- FK chains: account.userId → user.id  and  session.userId → user.id
--            are both updated to reference ba_users.id.
-- ============================================================================

BEGIN;

-- 1. Rename the table
ALTER TABLE public."user" RENAME TO ba_users;

-- 2. Drop existing FK constraints (they still point to the old name "user")
ALTER TABLE public.account  DROP CONSTRAINT IF EXISTS account_userId_fkey;
ALTER TABLE public.session  DROP CONSTRAINT IF EXISTS session_userId_fkey;

-- 3. Recreate FK constraints pointing to ba_users
ALTER TABLE public.account
  ADD CONSTRAINT account_userId_fkey
  FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;

ALTER TABLE public.session
  ADD CONSTRAINT session_userId_fkey
  FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;

-- 4. Rename the primary key index if it was named after the table
ALTER INDEX IF EXISTS user_pkey RENAME TO ba_users_pkey;

COMMIT;

-- ============================================================================
-- 5. Also drop any stale lowercase FK variants (original names before rename)
-- ============================================================================
ALTER TABLE public.account DROP CONSTRAINT IF EXISTS account_userid_fkey;
ALTER TABLE public.session DROP CONSTRAINT IF EXISTS session_userid_fkey;

-- ============================================================================
-- 6. Backfill ba_users into public.users canonical registry
-- ============================================================================
-- Run AFTER V004 so upsert_public_user_registry already exists.
DO $$
DECLARE
  rec record;
  parts text[];
  first_n text;
  last_n text;
BEGIN
  FOR rec IN SELECT id, name, email, "emailVerified", image, "createdAt" FROM public.ba_users LOOP
    parts   := string_to_array(coalesce(rec.name, ''), ' ');
    first_n := parts[1];
    last_n  := CASE WHEN array_length(parts, 1) > 1 THEN array_to_string(parts[2:], ' ') ELSE NULL END;

    BEGIN
      PERFORM public.upsert_public_user_registry(jsonb_build_object(
        'provider',         'better-auth',
        'auth_provider',    'better-auth',
        'auth_user_id',     rec.id,
        'email',            lower(rec.email),
        'first_name',       first_n,
        'last_name',        last_n,
        'full_name',        rec.name,
        'avatar_url',       rec.image,
        'role',             'user',
        'status',           'active',
        'email_verified_at', CASE WHEN rec."emailVerified" THEN rec."createdAt" ELSE NULL END,
        'last_sign_in_at',  rec."createdAt",
        'deleted_at',       NULL,
        'auth_metadata',    '{}'::jsonb,
        'profile_metadata', '{}'::jsonb,
        'provider_ids',     jsonb_build_object('better-auth', rec.id)
      ));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ba_users backfill skipped for %: %', rec.email, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- Verify
-- ============================================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_schema='public' AND table_name='ba_users') = 1,
    'ba_users table missing';
  ASSERT (SELECT count(*) FROM information_schema.table_constraints
          WHERE constraint_name='account_userId_fkey') = 1,
    'account FK missing';
  ASSERT (SELECT count(*) FROM information_schema.table_constraints
          WHERE constraint_name='session_userId_fkey') = 1,
    'session FK missing';
  RAISE NOTICE 'V005 verification passed: ba_users + FK constraints OK';
END;
$$;
