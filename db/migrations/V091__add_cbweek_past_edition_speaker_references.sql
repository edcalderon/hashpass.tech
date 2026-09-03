-- ============================================================================
-- V091: Add official CBWeek past-edition speaker references
-- ============================================================================
-- CBWeek's speaker page explicitly labels this roster "SPEAKERS DE NUESTRAS
-- EDICIONES PASADAS". These are historical references only, not confirmed
-- CBWeek 2026 speakers. Portraits are downloaded from the official CBWeek
-- site and re-hosted in HashPass event media before this migration is applied.
-- ============================================================================

BEGIN;

WITH past_speakers (id, name, title, company, image_slug, sort_order) AS (
  VALUES
    ('4abf6fc1-98a6-4c13-9b9f-100000000001', 'Charles Hoskinson', 'Founder Cardano Blockchain', 'CARDANO', 'charles-hoskinson', 100),
    ('4abf6fc1-98a6-4c13-9b9f-100000000002', 'Hernando de Soto', 'Presidente', 'ILD', 'hernando-de-soto', 110),
    ('4abf6fc1-98a6-4c13-9b9f-100000000003', 'Hong Fang', 'Presidente de OKX', 'OKX', 'hong-fang', 120),
    ('4abf6fc1-98a6-4c13-9b9f-100000000004', 'Daniel Acosta', 'Head of LATAM', 'BINANCE', 'daniel-acosta', 130),
    ('4abf6fc1-98a6-4c13-9b9f-100000000005', 'Patricio Mesri', 'Latam Country Manager', 'BYBIT', 'patricio-mesri', 140),
    ('4abf6fc1-98a6-4c13-9b9f-100000000006', 'Salvador Rivero', 'General Manager México', 'BINANCE', 'salvador-rivero', 150),
    ('4abf6fc1-98a6-4c13-9b9f-100000000007', 'Carolina Gama', 'Country Manager & LATAM Marketing Head', 'BITGET', 'carolina-gama', 160),
    ('4abf6fc1-98a6-4c13-9b9f-100000000008', 'Javier Gamboa', 'Business Developer Manager', 'BITUNIX', 'javier-gamboa', 170),
    ('4abf6fc1-98a6-4c13-9b9f-100000000009', 'André Sprone', 'Head of Latam', 'MEXC', 'andre-sprone', 180),
    ('4abf6fc1-98a6-4c13-9b9f-100000000010', 'Lesme Hernández', 'Brand Manager LATAM', 'BINGX', 'lesme-hernandez', 190),
    ('4abf6fc1-98a6-4c13-9b9f-100000000011', 'Santiago Juarros', 'Sr. Manager & Partner Marketing', 'CIRCLE', 'santiago-juarros', 200),
    ('4abf6fc1-98a6-4c13-9b9f-100000000012', 'Drey Dias', 'Sales Director', 'CHAINALYSIS', 'drey-dias', 210),
    ('4abf6fc1-98a6-4c13-9b9f-100000000013', 'Valentino Ruiz', 'Institutional Sales Trader', 'BLOCKCHAIN.COM', 'valentino-ruiz', 220),
    ('4abf6fc1-98a6-4c13-9b9f-100000000014', 'Lucas Macchiavelli', 'Operaciones Comerciales Global', 'INPUT OUTPUT', 'lucas-macchiavelli', 230),
    ('4abf6fc1-98a6-4c13-9b9f-100000000015', 'Mauro Andreoli', 'Midnight & IOG Argentina Representative', 'MIDNIGHT', 'mauro-andreoli', 240),
    ('4abf6fc1-98a6-4c13-9b9f-100000000016', 'Francisco Carvalho', 'CEO & Founder', 'BLOCKCHAIN RIO', 'francisco-carvalho', 250),
    ('4abf6fc1-98a6-4c13-9b9f-100000000017', 'Andre Gejde', 'Regional Growth Manager', 'TANGEM', 'andre-gejde', 260),
    ('4abf6fc1-98a6-4c13-9b9f-100000000018', 'Amilcar Erazo', 'Co-Founder & CEO', 'MERU', 'amilcar-erazo', 270),
    ('4abf6fc1-98a6-4c13-9b9f-100000000019', 'Rubén Galindo Steckel', 'CEO', 'AIRTM', 'ruben-galindo-steckel', 280),
    ('4abf6fc1-98a6-4c13-9b9f-100000000020', 'Rodrigo Martinez', 'Regional Manager LATAM', 'VANTAGE', 'rodrigo-martinez', 290),
    ('4abf6fc1-98a6-4c13-9b9f-100000000021', 'Renato Palacios', 'Business Developer', 'EXNESS', 'renato-palacios', 300),
    ('4abf6fc1-98a6-4c13-9b9f-100000000022', 'Efraín Barraza', 'Regional Expansion Manager LATAM', 'TETHER', 'efrain-barraza', 310),
    ('4abf6fc1-98a6-4c13-9b9f-100000000023', 'Patrick O''Neill', 'Founder & Managing Partner', 'SHERLOCK COMMUNICATIONS', 'patrick-oneill', 320),
    ('4abf6fc1-98a6-4c13-9b9f-100000000024', 'Alvaro Olivares', 'Country Manager', 'BITGO', 'alvaro-olivares', 330),
    ('4abf6fc1-98a6-4c13-9b9f-100000000025', 'Pablo De Santis', 'Communications Lead South Cone', 'WORLD', 'pablo-de-santis', 340),
    ('4abf6fc1-98a6-4c13-9b9f-100000000026', 'Valentín Popescu', 'Co-Founder & Director', 'MOTIV PERÚ', 'valentin-popescu', 350)
)
INSERT INTO public.speakers (
  id, event_id, name, title, company, bio, image_url, social_links, metadata, sort_order
)
SELECT
  id::uuid,
  'cbweek2026',
  name,
  title,
  company,
  'Official CBWeek past-edition speaker reference. ' || name || ' is not announced as a CBWeek 2026 speaker.',
  'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/past-editions/' || image_slug || '.webp',
  '{}'::jsonb,
  '{"is_active":false,"is_demo_programme":true,"is_past_edition_reference":true,"source":"https://colombiablockchainweek.com/"}'::jsonb,
  sort_order
FROM past_speakers
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

UPDATE public.events
SET metadata = jsonb_set(
      metadata,
      '{hashpassDemoProgramme,pastEditionSpeakerReferences}',
      '26'::jsonb,
      true
    ),
    updated_at = now()
WHERE id = 'cbweek2026';

COMMIT;
