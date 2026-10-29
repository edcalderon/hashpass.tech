-- BSL Bogotá 2026 "Sala paralela" workshops (Meru, Hedera, Banco W,
-- Relámpago Payments), published at https://blockchainsummit.la/colombia2026/.
-- `workshop` has been an allowed event_agenda.type since V024, so no schema
-- change is needed: these are plain agenda rows. source_id stays NULL on
-- purpose -- sync_bsl_public_programme (V107) only reconciles rows carrying its
-- own source_id, so the programme sync never deletes these.
BEGIN;

INSERT INTO public.event_agenda
  (id, event_id, "time", title, description, speakers, type, location, day, day_name)
VALUES
  ('colombia2026-workshop-meru', 'colombia2026', '2026-11-04T12:00:00-05:00',
   'Workshop Meru', 'Sesión especializada en formato reducido · Sala paralela.',
   ARRAY[]::text[], 'workshop', 'Workshop · Sala paralela', '1', 'Miércoles 4 de noviembre'),
  ('colombia2026-workshop-hedera', 'colombia2026', '2026-11-04T14:00:00-05:00',
   'Workshop Hedera', 'Sesión especializada en formato reducido · Sala paralela.',
   ARRAY[]::text[], 'workshop', 'Workshop · Sala paralela', '1', 'Miércoles 4 de noviembre'),
  ('colombia2026-workshop-banco-w', 'colombia2026', '2026-11-05T12:00:00-05:00',
   'Workshop Banco W', 'Sesión especializada en formato reducido · Sala paralela.',
   ARRAY[]::text[], 'workshop', 'Workshop · Sala paralela', '2', 'Jueves 5 de noviembre'),
  ('colombia2026-workshop-relampago-payments', 'colombia2026', '2026-11-05T14:00:00-05:00',
   'Workshop Relámpago Payments', 'Sesión especializada en formato reducido · Sala paralela.',
   ARRAY[]::text[], 'workshop', 'Workshop · Sala paralela', '2', 'Jueves 5 de noviembre')
ON CONFLICT (id) DO UPDATE SET
  "time" = EXCLUDED."time", title = EXCLUDED.title, description = EXCLUDED.description,
  type = EXCLUDED.type, location = EXCLUDED.location, day = EXCLUDED.day,
  day_name = EXCLUDED.day_name, updated_at = now();

COMMIT;
