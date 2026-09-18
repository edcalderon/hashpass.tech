-- V092 can run in the default groups before the profile's event bootstrap.
-- Reconcile existing verified users after CBWeek has been created/renamed,
-- including databases where the earlier conditional backfill was a no-op.
BEGIN;

DO $$
DECLARE v_user record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events WHERE id = 'cbweek2026' AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'CBWeek must be bootstrapped and published before its pass backfill';
  END IF;

  FOR v_user IN SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL LOOP
    PERFORM public.create_default_pass(v_user.id::text, 'general', 'cbweek2026');
  END LOOP;
END;
$$;

COMMIT;
