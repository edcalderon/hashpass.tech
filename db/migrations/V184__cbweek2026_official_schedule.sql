-- ============================================================================
-- V184: Replace the CBWeek 2026 demo agenda with the officially published hours
-- ============================================================================
-- Source: https://colombiablockchainweek.com/ (FAQ + event metadata, checked
-- 2026-11-17). The organizers have NOT published a session-level agenda, so the
-- only real schedule items are the two event blocks below. All hours are
-- Colombia time (America/Bogota, UTC-5):
--   * Welcome Drink Night: Fri 11 Dec 2026, 19:30 - 00:00, Mamba Negra Rooftop,
--     El Poblado (private, EXPERIENCE ticket only).
--   * Main Day: Sat 12 Dec 2026, 07:30 - 18:00, Hotel InterContinental Medellin,
--     Calle 16, Variante #28-51, Las Palmas, El Poblado (every ticket type).
-- Scope: event_id = 'cbweek2026' ONLY. BSL Colombia ('colombia2026') is a
-- different event and is not touched. The invented demo sessions (V089,
-- ids cbweek2026-demo-NN) are removed so nothing made up is shown as real.
-- ============================================================================

BEGIN;

DELETE FROM public.event_agenda
WHERE event_id = 'cbweek2026'
  AND id LIKE 'cbweek2026-demo-%';

INSERT INTO public.event_agenda (
  id, event_id, time, title, description, speakers, type, location, day, day_name
)
VALUES
  (
    'cbweek2026-official-welcome-drink', 'cbweek2026',
    '2026-12-11T19:30:00-05:00',
    'Welcome Drink Night',
    'Viernes 11 de diciembre, de 7:30 p. m. a 12:00 a. m. Evento privado incluido solo con la entrada EXPERIENCE. Horario oficial de Colombia Blockchain Week.',
    ARRAY[]::text[], 'networking', 'Mamba Negra Rooftop · El Poblado, Medellín', '1', 'Welcome Drink (privado)'
  ),
  (
    'cbweek2026-official-main-day', 'cbweek2026',
    '2026-12-12T07:30:00-05:00',
    'Main Day · Colombia Blockchain Week',
    'Sábado 12 de diciembre, de 7:30 a. m. a 6:00 p. m., incluido en todas las entradas. La agenda por sesiones aún no ha sido publicada por los organizadores.',
    ARRAY[]::text[], 'networking',
    'Hotel InterContinental Medellín · Calle 16, Variante #28-51, Las Palmas, El Poblado', '2', 'Main Day'
  )
ON CONFLICT (id) DO UPDATE SET
  time = EXCLUDED.time,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  speakers = EXCLUDED.speakers,
  type = EXCLUDED.type,
  location = EXCLUDED.location,
  day = EXCLUDED.day,
  day_name = EXCLUDED.day_name,
  updated_at = now();

-- Keep the event record aligned with the published hours (the earlier metadata
-- assumed an 08:30 Main Day start and never recorded the Welcome Drink time).
UPDATE public.events
SET starts_at = '2026-12-11T19:30:00-05:00',
    ends_at = '2026-12-12T18:00:00-05:00',
    metadata = (COALESCE(metadata, '{}'::jsonb) - 'hashpassDemoProgramme') || jsonb_build_object(
      'mainDay', jsonb_build_object('date', '2026-12-12', 'startsAt', '07:30', 'endsAt', '18:00'),
      'welcomeDrink', jsonb_build_object(
        'date', '2026-12-11', 'startsAt', '19:30', 'endsAt', '00:00',
        'access', 'private', 'venue', 'Mamba Negra Rooftop, El Poblado, Medellín'
      ),
      'agendaStatus', 'schedule_only',
      'speakerStatus', 'announced',
      'scheduleSource', 'https://colombiablockchainweek.com/',
      'scheduleVerifiedAt', '2026-11-17'
    ),
    updated_at = now()
WHERE id = 'cbweek2026';

COMMIT;
