-- Guest mode currently has no way to know whether an event wants its agenda
-- and/or speaker directory shown to unauthenticated visitors -- the only
-- existing gate is `events.status`, which controls whether the event exists
-- publicly at all, not whether these two specific sections are public.
--
-- These flags are read by the server API routes
-- (apps/mobile-app/app/api/events/[eventId]/agenda+api.ts,
-- speakers+api.ts, details+api.ts), not by RLS: those routes use the
-- service-role Supabase client (lib/supabase-server.ts), which bypasses RLS
-- entirely, so a policy-only gate here would be silently unenforced.
--
-- Defaulting both to true matches the real current state (every event's
-- speakers and agenda are shown today) -- no backfill beyond the column
-- default is needed. An admin UI to toggle these per event is tracked
-- separately; today they can only be flipped with a direct DB write.
BEGIN;

ALTER TABLE IF EXISTS public.events
  ADD COLUMN IF NOT EXISTS agenda_public boolean NOT NULL DEFAULT true;

ALTER TABLE IF EXISTS public.events
  ADD COLUMN IF NOT EXISTS speakers_public boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.events.agenda_public IS
  'Whether this event''s agenda is shown to unauthenticated/guest visitors. Enforced in agenda+api.ts (service-role client bypasses RLS), not by a DB policy.';
COMMENT ON COLUMN public.events.speakers_public IS
  'Whether this event''s speaker directory is shown to unauthenticated/guest visitors. Enforced in speakers+api.ts (service-role client bypasses RLS), not by a DB policy.';

COMMIT;
