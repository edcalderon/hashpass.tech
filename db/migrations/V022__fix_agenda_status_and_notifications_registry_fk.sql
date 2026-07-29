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
-- This migration is idempotent and safe to run on a project that has already
-- been fixed (constraint checks are guarded with existence checks).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  tbl_exists boolean;
  fk_target text;
  orphan_count integer;
BEGIN

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
      -- Orphaned rows: no matching public.user row linked via provider_ids.
      -- These are stale/test rows for accounts whose registry link never
      -- completed; safe to drop from a preference table (re-derivable from
      -- future user interaction) rather than block the whole migration.
      SELECT count(*) INTO orphan_count
      FROM public.user_agenda_status uas
      WHERE NOT EXISTS (
        SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = uas.user_id::text
      );
      IF orphan_count > 0 THEN
        RAISE NOTICE 'user_agenda_status: deleting % orphaned row(s) with no matching public.user registry entry', orphan_count;
        DELETE FROM public.user_agenda_status uas
        WHERE NOT EXISTS (
          SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = uas.user_id::text
        );
      END IF;

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
      SELECT count(*) INTO orphan_count
      FROM public.notifications n
      WHERE NOT EXISTS (
        SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = n.user_id::text
      );
      IF orphan_count > 0 THEN
        RAISE NOTICE 'notifications: deleting % orphaned row(s) with no matching public.user registry entry', orphan_count;
        DELETE FROM public.notifications n
        WHERE NOT EXISTS (
          SELECT 1 FROM public."user" u WHERE u.provider_ids->>'supabase' = n.user_id::text
        );
      END IF;

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
    ELSE
      RAISE NOTICE 'notifications: FK already targets public."user"(id), skipping';
    END IF;
  END IF;

END;
$$;

COMMIT;
