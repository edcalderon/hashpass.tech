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
