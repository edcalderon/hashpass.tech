-- Meeting request participants are Supabase auth UUIDs. Notifications for
-- those requests must use the same identity domain; otherwise the meeting
-- request transaction fails while notifying its requester or speaker.
--
-- V022 previously normalized notifications to public."user" registry IDs.
-- Convert any existing registry-backed rows back through provider_ids before
-- moving the foreign key to auth.users. Refuse to proceed if a historical row
-- cannot be mapped, preserving it for explicit remediation.

BEGIN;

DO $$
DECLARE
  v_unmappable_count integer;
  v_uses_auth_identity boolean;
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'notifications table does not exist; skipping identity alignment';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_user_id_fkey'
      AND confrelid = 'auth.users'::regclass
  ) INTO v_uses_auth_identity;

  IF NOT v_uses_auth_identity THEN
    SELECT count(*)
    INTO v_unmappable_count
    FROM public.notifications n
    LEFT JOIN public."user" registry_user ON registry_user.id = n.user_id
    LEFT JOIN auth.users auth_user
      ON auth_user.id = NULLIF(registry_user.provider_ids->>'supabase', '')::uuid
    WHERE n.user_id IS NOT NULL
      AND auth_user.id IS NULL;

    IF v_unmappable_count > 0 THEN
      RAISE EXCEPTION
        'Cannot align notifications.user_id: % row(s) are not linked to auth.users',
        v_unmappable_count;
    END IF;

    UPDATE public.notifications n
    SET user_id = (registry_user.provider_ids->>'supabase')::uuid
    FROM public."user" registry_user
    WHERE registry_user.id = n.user_id
      AND n.user_id IS DISTINCT FROM (registry_user.provider_ids->>'supabase')::uuid;

    ALTER TABLE public.notifications
      DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
  CREATE POLICY notifications_select_own ON public.notifications
    FOR SELECT USING (user_id = auth.uid());

  DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
  CREATE POLICY notifications_update_own ON public.notifications
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
  CREATE POLICY notifications_delete_own ON public.notifications
    FOR DELETE USING (user_id = auth.uid());
END;
$$;

COMMIT;
