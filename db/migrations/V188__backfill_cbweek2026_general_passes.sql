-- ============================================================================
-- V188: Give every verified account a general CBWeek 2026 pass
-- ============================================================================
-- V092 installed the trigger that provisions a general pass for each newly
-- verified account, but its one-off backfill ran before the cbweek2026 event
-- existed in production (a no-op), and the reconciling V094 lives in the
-- development-only demo-event-bootstrap group. Production therefore left every
-- account created before 2026-10-20 without a pass, so they could not open the
-- event room. A general pass is read-only in chat (see
-- apps/mobile-app/lib/event-chat-permissions.ts): it can read the room but not
-- post or send direct messages.
-- create_default_pass is idempotent (returns the existing CBWeek pass), so this
-- is safe to re-run. Scope: event_id = 'cbweek2026' only.
-- ============================================================================

BEGIN;

DO $$
DECLARE v_user record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.events WHERE id = 'cbweek2026' AND status = 'published') THEN
    FOR v_user IN SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL LOOP
      PERFORM public.create_default_pass(v_user.id::text, 'general', 'cbweek2026');
    END LOOP;
  END IF;
END;
$$;

COMMIT;
