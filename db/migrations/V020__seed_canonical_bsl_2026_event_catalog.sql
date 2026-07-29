-- ============================================================================
-- V020: Canonical BSL 2026 event catalog
--
-- Keep the durable event registry aligned with the mobile fallback catalog.
-- This is intentionally an upsert: it repairs incomplete early seed rows while
-- preserving unrelated metadata that an event administrator may have added.
-- ============================================================================

BEGIN;

INSERT INTO public.events (
  id, name, slug, status, starts_at, ends_at, timezone,
  venue_name, city, country, description, branding, metadata
)
VALUES
  (
    'peru2026',
    'Blockchain Summit Latam Perú 2026',
    'peru2026',
    'published',
    '2026-05-13T09:00:00-05:00'::timestamptz,
    '2026-05-15T23:59:59-05:00'::timestamptz,
    'America/Lima',
    'Universidad del Pacífico',
    'Lima',
    'Perú',
    'Banco Central de Reserva del Perú and institutional finance.',
    '{"primaryColor":"#D11A2A","secondaryColor":"#06111F","logo":"/assets/logos/bsl/bsl-peru-pro.svg","favicon":"/favicon.ico"}'::jsonb,
    '{"domain":"peru2026.hashpass.tech","website":"https://blockchainsummit.la/peru2026/","eventType":"whitelabel","hubEventId":"bsl","tourRole":"stop","stopOrder":1,"features":["matchmaking","speakers","bookings","admin"]}'::jsonb
  ),
  (
    'chile2026',
    'Blockchain Summit Latam Chile 2026',
    'chile2026',
    'published',
    '2026-08-05T09:00:00-04:00'::timestamptz,
    '2026-08-07T23:59:59-04:00'::timestamptz,
    'America/Santiago',
    'Universidad de Chile - FEN - Alta Dirección',
    'Santiago',
    'Chile',
    'Digital finance, payments modernization, and institutional regulation with Banco Central de Chile.',
    '{"primaryColor":"#FF5B5B","secondaryColor":"#06111F","logo":"/assets/logos/bsl/bsl-chile-pro.svg","favicon":"/favicon.ico"}'::jsonb,
    '{"domain":"chile2026.hashpass.tech","website":"https://blockchainsummit.la/chile2026/","eventType":"whitelabel","hubEventId":"bsl","tourRole":"stop","stopOrder":2,"features":["matchmaking","speakers","bookings","admin"]}'::jsonb
  ),
  (
    'colombia2026',
    'Blockchain Summit Latam Colombia 2026',
    'colombia2026',
    'published',
    '2026-11-05T09:00:00-05:00'::timestamptz,
    '2026-11-06T23:59:59-05:00'::timestamptz,
    'America/Bogota',
    'Bogotá, Colombia',
    'Bogotá',
    'Colombia',
    'Institutional and regulatory summit for the Andean region with Banco de la República.',
    '{"primaryColor":"#F5C542","secondaryColor":"#06111F","logo":"/assets/logos/bsl/bsl-colombia-pro.svg","favicon":"/favicon.ico"}'::jsonb,
    '{"domain":"colombia2026.hashpass.tech","website":"https://blockchainsummit.la/colombia2026/","eventType":"whitelabel","hubEventId":"bsl","tourRole":"stop","stopOrder":3,"features":["matchmaking","speakers","bookings","admin"]}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  timezone = EXCLUDED.timezone,
  venue_name = EXCLUDED.venue_name,
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  description = EXCLUDED.description,
  branding = EXCLUDED.branding,
  metadata = public.events.metadata || EXCLUDED.metadata,
  updated_at = now();

COMMIT;
