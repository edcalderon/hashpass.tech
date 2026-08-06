-- Baseline: event_agenda was never created by any file in this directory --
-- flagged by code review 2026-08-06, same class of gap as V009/V017/V022.
-- No initial type CHECK is added here since this file immediately drops
-- and replaces it below regardless. Sourced from a live BSL prod schema
-- dump (pg_dump --schema-only, 2026-08-06).
CREATE TABLE IF NOT EXISTS public.event_agenda (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id text NOT NULL DEFAULT 'bsl2025',
  "time" timestamptz NOT NULL,
  title text NOT NULL,
  description text,
  speakers text[],
  type text,
  location text,
  day text,
  day_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_agenda ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY event_agenda_public_read ON public.event_agenda FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Keep the legacy event_agenda table aligned with the agenda item types
-- consumed by the mobile/web client and published event configurations.
BEGIN;

ALTER TABLE public.event_agenda
  DROP CONSTRAINT IF EXISTS event_agenda_type_check;

ALTER TABLE public.event_agenda
  ADD CONSTRAINT event_agenda_type_check
  CHECK (type = ANY (ARRAY[
    'keynote'::text,
    'panel'::text,
    'workshop'::text,
    'networking'::text,
    'break'::text,
    'registration'::text,
    'meal'::text
  ]));

COMMIT;
