-- Baseline: user_agenda_status was never created by any file in this
-- directory -- its real origin is archive/legacy-root/supabase/migrations/
-- 20251031050000_create_user_agenda_status.sql, which predates this
-- V0xx series and was never ported in. Flagged by code review 2026-08-06,
-- same class of gap as V009/V017. Shape (and its RLS policies, since it's
-- about to get RLS-repointed below) sourced from a live BSL prod schema
-- dump (pg_dump --schema-only, 2026-08-06) rather than the archived
-- original, since the archived version predates a lot of since-applied,
-- also-out-of-band drift that a fresh bootstrap needs to match.
CREATE TABLE IF NOT EXISTS public.user_agenda_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_id text NOT NULL DEFAULT 'bsl2025',
  agenda_id text,
  meeting_id uuid,
  slot_time timestamptz,
  status text NOT NULL DEFAULT 'tentative',
  slot_status text,
  is_favorite boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_agenda_status_user_agenda
  ON public.user_agenda_status (user_id, event_id, agenda_id) WHERE agenda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_user_event
  ON public.user_agenda_status (user_id, event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_agenda_status_user_meeting
  ON public.user_agenda_status (user_id, event_id, meeting_id) WHERE meeting_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_agenda_status_user_slot
  ON public.user_agenda_status (user_id, event_id, slot_time) WHERE slot_time IS NOT NULL;

ALTER TABLE public.user_agenda_status ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY user_agenda_status_select_own ON public.user_agenda_status FOR SELECT USING (user_id = auth.uid());
  CREATE POLICY user_agenda_status_insert_own ON public.user_agenda_status FOR INSERT WITH CHECK (user_id = auth.uid());
  CREATE POLICY user_agenda_status_update_own ON public.user_agenda_status FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  CREATE POLICY user_agenda_status_delete_own ON public.user_agenda_status FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- V022: Repoint user_agenda_status.user_id and notifications.user_id at
--       public.user(id) instead of the legacy auth.users(id)
-- ============================================================================
-- Both tables were originally created (2025-10-31 / 2025-12-19, archived under
-- archive/legacy-root/supabase/migrations/) with:
--   user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
--
-- packages/tools/scripts/sql/target-bsl-bootstrap.sql (the intended full
-- schema, used to provision fresh projects) declares both tables as
-- REFERENCES public."user"(id) instead, matching how the app already
-- resolves identity: apps/mobile-app/lib/server/resolve-notification-identity.ts
-- deliberately prefers registryUserId (public.user.id) over supabaseUserId
-- (auth.users.id) for exactly these two tables, because public.user.id is
-- independently generated and not guaranteed to equal the auth.users id.
--
-- Any project that was incrementally migrated (rather than freshly bootstrapped
-- from target-bsl-bootstrap.sql) never got this FK repointed, so writes from
-- the app fail with:
--   insert or update on table "user_agenda_status" violates foreign key
--   constraint "user_agenda_status_user_id_fkey"
--   Key (user_id)=(...) is not present in table "users"
--
-- IMPORTANT: on an incrementally migrated project, a legitimate auth.users
-- account can lack a matching public.user registry row (pre-registry-trigger
-- accounts, native sign-ins that never called syncPublicUserRegistry — see
-- resolveOrCreateRegistryUserId's self-heal comment in
-- resolve-notification-identity.ts). Those users' existing agenda
-- preferences / notification history are NOT orphaned garbage; the registry
-- row is simply missing. This migration backfills the missing public.user
-- rows from auth.users via the same upsert_public_user_registry() function
-- the app uses to self-heal, THEN remaps user_id. Rows for an id that has no
-- corresponding auth.users account at all (truly orphaned, e.g. a deleted
-- auth user) are left untouched and reported via NOTICE — the FK is only
-- tightened for a table once every existing row can be resolved, so a
-- leftover truly-orphaned row does not block the migration by being
-- silently deleted or by failing the whole ALTER.
--
-- This migration is idempotent and safe to run on a project that has already
-- been fixed (constraint checks are guarded with existence checks).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  tbl_exists boolean;
  fk_target text;
  backfilled_count integer;
  unresolvable_count integer;
  rec record;
BEGIN

  -- ==========================================================================
  -- 0. Backfill missing public.user registry rows for any auth.users id that
  --    user_agenda_status or notifications currently reference, so the
  --    remap below has somewhere to point every existing row.
  -- ==========================================================================
  backfilled_count := 0;
  FOR rec IN
    SELECT DISTINCT au.id AS auth_id, au.email, au.raw_user_meta_data
    FROM auth.users au
    WHERE EXISTS (
      SELECT 1 FROM public.user_agenda_status uas WHERE uas.user_id = au.id
    ) OR EXISTS (
      SELECT 1 FROM public.notifications n WHERE n.user_id = au.id
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = rec.auth_id::text
    ) THEN
      IF rec.email IS NULL OR trim(rec.email) = '' THEN
        RAISE NOTICE 'V022: auth.users % has no email, cannot backfill a public.user registry row for it', rec.auth_id;
        CONTINUE;
      END IF;
      PERFORM public.upsert_public_user_registry(jsonb_build_object(
        'provider', 'supabase',
        'auth_provider', 'supabase',
        'auth_user_id', rec.auth_id::text,
        'email', lower(trim(rec.email)),
        'full_name', rec.raw_user_meta_data->>'full_name',
        'avatar_url', rec.raw_user_meta_data->>'avatar_url',
        'role', 'user',
        'status', 'active',
        'provider_ids', jsonb_build_object('supabase', rec.auth_id::text)
      ));
      backfilled_count := backfilled_count + 1;
    END IF;
  END LOOP;
  IF backfilled_count > 0 THEN
    RAISE NOTICE 'V022: backfilled % missing public.user registry row(s) from auth.users', backfilled_count;
  END IF;

  -- ==========================================================================
  -- user_agenda_status
  -- ==========================================================================
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_agenda_status'
  ) INTO tbl_exists;

  IF tbl_exists THEN
    SELECT ccu.table_name INTO fk_target
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_name = 'user_agenda_status_user_id_fkey'
      AND tc.table_schema = 'public';

    IF fk_target IS DISTINCT FROM 'user' THEN
      -- Rows whose user_id still has no matching public.user row even after
      -- the backfill above (no corresponding auth.users account at all —
      -- e.g. a deleted auth user). Report and leave the FK untouched rather
      -- than deleting these rows or forcing an ALTER that would fail.
      SELECT count(*) INTO unresolvable_count
      FROM public.user_agenda_status uas
      WHERE NOT EXISTS (
        SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = uas.user_id::text
      );

      IF unresolvable_count > 0 THEN
        RAISE NOTICE 'user_agenda_status: % row(s) still unresolvable after backfill (no matching auth.users account) — skipping FK repoint, preserving rows as-is', unresolvable_count;
      ELSE
        UPDATE public.user_agenda_status uas
        SET user_id = u.id
        FROM public."user" u
        WHERE u.provider_ids->>'supabase' = uas.user_id::text;

        ALTER TABLE public.user_agenda_status
          DROP CONSTRAINT IF EXISTS user_agenda_status_user_id_fkey;
        ALTER TABLE public.user_agenda_status
          ADD CONSTRAINT user_agenda_status_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

        DROP POLICY IF EXISTS user_agenda_status_select_own ON public.user_agenda_status;
        CREATE POLICY user_agenda_status_select_own ON public.user_agenda_status
          FOR SELECT USING (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        DROP POLICY IF EXISTS user_agenda_status_insert_own ON public.user_agenda_status;
        CREATE POLICY user_agenda_status_insert_own ON public.user_agenda_status
          FOR INSERT WITH CHECK (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        DROP POLICY IF EXISTS user_agenda_status_update_own ON public.user_agenda_status;
        CREATE POLICY user_agenda_status_update_own ON public.user_agenda_status
          FOR UPDATE USING (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          )
          WITH CHECK (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        DROP POLICY IF EXISTS user_agenda_status_delete_own ON public.user_agenda_status;
        CREATE POLICY user_agenda_status_delete_own ON public.user_agenda_status
          FOR DELETE USING (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        RAISE NOTICE 'user_agenda_status: FK repointed to public."user"(id), RLS policies updated';
      END IF;
    ELSE
      RAISE NOTICE 'user_agenda_status: FK already targets public."user"(id), skipping';
    END IF;
  END IF;

  -- ==========================================================================
  -- notifications
  -- ==========================================================================
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) INTO tbl_exists;

  IF tbl_exists THEN
    SELECT ccu.table_name INTO fk_target
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_name = 'notifications_user_id_fkey'
      AND tc.table_schema = 'public';

    IF fk_target IS DISTINCT FROM 'user' THEN
      SELECT count(*) INTO unresolvable_count
      FROM public.notifications n
      WHERE NOT EXISTS (
        SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = n.user_id::text
      );

      IF unresolvable_count > 0 THEN
        RAISE NOTICE 'notifications: % row(s) still unresolvable after backfill (no matching auth.users account) — skipping FK repoint, preserving rows as-is', unresolvable_count;
      ELSE
        UPDATE public.notifications n
        SET user_id = u.id
        FROM public."user" u
        WHERE u.provider_ids->>'supabase' = n.user_id::text;

        ALTER TABLE public.notifications
          DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
        ALTER TABLE public.notifications
          ADD CONSTRAINT notifications_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;

        DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
        CREATE POLICY notifications_select_own ON public.notifications
          FOR SELECT USING (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
        CREATE POLICY notifications_update_own ON public.notifications
          FOR UPDATE USING (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          )
          WITH CHECK (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
        CREATE POLICY notifications_delete_own ON public.notifications
          FOR DELETE USING (
            user_id IN (SELECT id FROM public."user" WHERE provider_ids->>'supabase' = auth.uid()::text)
          );

        RAISE NOTICE 'notifications: FK repointed to public."user"(id), RLS policies updated';
      END IF;
    ELSE
      RAISE NOTICE 'notifications: FK already targets public."user"(id), skipping';
    END IF;
  END IF;

END;
$$;

COMMIT;
