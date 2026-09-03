-- ============================================================================
-- V089: Seed the HashPass demo programme for Colombia Blockchain Week 2026
-- ============================================================================
-- CBWeek's public site confirms the Main Day (12 December, 08:30–18:00), its
-- organizer contacts, and ten topic pillars. It does not publish a timed
-- agenda or confirmed 2026 speakers. These rows are therefore explicitly a
-- HashPass demo programme, not an organizer-announced schedule.
-- ============================================================================

BEGIN;

-- The original generic-speaker constraint used `UNIQUE NULLS NOT DISTINCT`,
-- which permits only one organizer-managed (user_id IS NULL) speaker per
-- event. Keep uniqueness for linked user accounts while allowing a normal
-- event directory with multiple unclaimed speakers.
ALTER TABLE public.speakers
  DROP CONSTRAINT IF EXISTS speakers_event_user_unique;
CREATE UNIQUE INDEX IF NOT EXISTS speakers_event_user_unique
  ON public.speakers (event_id, user_id)
  WHERE user_id IS NOT NULL;

INSERT INTO public.speakers (
  id, event_id, name, title, company, bio, image_url, social_links, metadata, sort_order
)
VALUES
  (
    '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201', 'cbweek2026', 'Bryan Aguilar', 'CEO', 'LATAM Blockchain Events LLC',
    'CEO of LATAM Blockchain Events LLC. Listed on the official CBWeek contact section; included in this HashPass demo programme at organizer direction, not as an officially announced CBWeek 2026 speaker.',
    'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/bryan-aguilar.png',
    '{}'::jsonb,
    '{"is_active":true,"is_demo_programme":true,"source":"https://colombiablockchainweek.com/"}'::jsonb,
    10
  ),
  (
    '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202', 'cbweek2026', 'Lucero Dextre', 'COO', 'LATAM Blockchain Events LLC',
    'COO of LATAM Blockchain Events LLC. Listed on the official CBWeek contact section; included in this HashPass demo programme at organizer direction, not as an officially announced CBWeek 2026 speaker.',
    'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/lucero-dextre.png',
    '{}'::jsonb,
    '{"is_active":true,"is_demo_programme":true,"source":"https://colombiablockchainweek.com/"}'::jsonb,
    20
  ),
  (
    '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203', 'cbweek2026', 'Edward Calderón', 'CEO', 'HASHPASS',
    'CEO of HashPass and blockchain technology leader. Included in this HashPass demo programme at organizer direction, not as an officially announced CBWeek 2026 speaker.',
    'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/edward-calderon.png',
    '{}'::jsonb,
    '{"is_active":true,"is_demo_programme":true,"source":"HashPass speaker directory"}'::jsonb,
    30
  )
ON CONFLICT (id) DO UPDATE SET
  event_id = EXCLUDED.event_id,
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  company = EXCLUDED.company,
  bio = EXCLUDED.bio,
  image_url = EXCLUDED.image_url,
  social_links = EXCLUDED.social_links,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

DELETE FROM public.event_agenda
WHERE event_id = 'cbweek2026'
  AND id LIKE 'cbweek2026-demo-%';

INSERT INTO public.event_agenda (
  id, event_id, time, title, description, speakers, type, location, day, day_name
)
VALUES
  ('cbweek2026-demo-01', 'cbweek2026', '2026-12-12T08:30:00-05:00', 'Acreditación y bienvenida', 'Programa demo de HashPass para el Main Day (08:30–18:00).', ARRAY[]::text[], 'registration', 'Registro · Hotel InterContinental Medellín', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-02', 'cbweek2026', '2026-12-12T09:00:00-05:00', 'Apertura: Medellín entra al mapa cripto de LATAM', 'Demo keynote de apertura del programa basado en los temas publicados por CBWeek.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201'], 'keynote', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-03', 'cbweek2026', '2026-12-12T09:30:00-05:00', 'Blockchain, Bitcoin, Criptomonedas & Trading', 'Fundamentos, adopción y estrategias para entender y operar el ecosistema cripto global. Tema publicado por CBWeek; sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201'], 'keynote', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-04', 'cbweek2026', '2026-12-12T10:00:00-05:00', 'Forex, Inversiones & Mercados Financieros · Exchanges & Brokers', 'Análisis macroeconómico, gestión de riesgo, oportunidades, plataformas, liquidez y herramientas que conectan a inversionistas con mercados globales. Sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201'], 'panel', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-05', 'cbweek2026', '2026-12-12T11:00:00-05:00', 'Coffee break y visitas a stands', 'Espacio demo para networking y descubrimiento de soluciones.', ARRAY[]::text[], 'break', 'Zona de Stands', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-06', 'cbweek2026', '2026-12-12T11:15:00-05:00', 'Activos Digitales, Stablecoins, OTC, P2P, Liquidez, Wallets & Pagos Digitales', 'Infraestructura y soluciones para custodiar, intercambiar y mover valor digital sin fronteras. Tema publicado por CBWeek; sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202'], 'panel', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-07', 'cbweek2026', '2026-12-12T12:15:00-05:00', 'Tokenización, RWA, Web3, Fintech & Startups', 'Casos de innovación que llevan activos, productos y nuevos negocios al entorno on-chain. Tema publicado por CBWeek; sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203'], 'keynote', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-08', 'cbweek2026', '2026-12-12T12:45:00-05:00', 'Custodia, Servicios Institucionales & Soluciones B2B', 'Servicios seguros y escalables para empresas e instituciones que adoptan activos digitales. Tema publicado por CBWeek; sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203'], 'panel', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-09', 'cbweek2026', '2026-12-12T13:45:00-05:00', 'Almuerzo y networking', 'Espacio demo de conexiones de negocio.', ARRAY[]::text[], 'meal', 'Networking Zone', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-10', 'cbweek2026', '2026-12-12T14:45:00-05:00', 'DeFi, Regulación & Marco Legal LATAM', 'Protocolos descentralizados y marcos normativos que están definiendo el futuro financiero regional. Tema publicado por CBWeek; sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203'], 'panel', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-11', 'cbweek2026', '2026-12-12T15:45:00-05:00', 'Educación Financiera & Web3', 'Conocimiento práctico para tomar mejores decisiones y participar responsablemente en la economía digital. Tema publicado por CBWeek; taller demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202'], 'workshop', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-12', 'cbweek2026', '2026-12-12T16:15:00-05:00', 'Inteligencia Artificial & Tecnologías Emergentes', 'Aplicaciones de IA y tecnologías emergentes que transforman productos, operaciones y experiencias digitales. Tema publicado por CBWeek; taller demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203'], 'workshop', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-13', 'cbweek2026', '2026-12-12T16:45:00-05:00', 'Security, Compliance & Blockchain Analytics', 'Prevención de fraude, trazabilidad y cumplimiento para construir un ecosistema Web3 más confiable. Tema publicado por CBWeek; sesión demo.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203'], 'keynote', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-14', 'cbweek2026', '2026-12-12T17:15:00-05:00', 'Cierre: conexiones que impulsan el circuito LATAM', 'Panel demo de cierre sobre educación, adopción, negocios y experiencias presenciales en la región.', ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202'], 'keynote', 'Main Stage', '1', 'Programa demo · Main Day'),
  ('cbweek2026-demo-15', 'cbweek2026', '2026-12-12T17:45:00-05:00', 'Networking de cierre', '17:45–18:00 · Cierre del Main Day. Espacio demo de conexiones.', ARRAY[]::text[], 'break', 'Networking Zone', '1', 'Programa demo · Main Day');

UPDATE public.events
SET metadata = metadata || '{"hashpassDemoProgramme":{"status":"demo","source":"https://colombiablockchainweek.com/","officialAgendaAnnounced":false,"officialSpeakersAnnounced":false,"mainDay":"2026-12-12T08:30:00-05:00/2026-12-12T18:00:00-05:00"}}'::jsonb,
    updated_at = now()
WHERE id = 'cbweek2026';

COMMIT;
