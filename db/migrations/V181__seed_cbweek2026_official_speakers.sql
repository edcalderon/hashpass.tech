-- ============================================================================
-- V181: Seed the official Colombia Blockchain Week 2026 speakers
-- ============================================================================
-- Source: https://colombiablockchainweek.com/ ("Speakers 2026", 17 profiles).
-- Scope: event_id = 'cbweek2026' ONLY (Colombia Blockchain Week, 11-12 Dec 2026,
-- Medellin). This is NOT BSL Colombia ('colombia2026', blockchainsummit.la,
-- 4-6 Nov 2026), which lives in public.bsl_speakers. Never match the two by
-- name: the same person can appear in both events as a separate profile.
--
-- Profiles are imported unclaimed (user_id IS NULL, no email/account is
-- invented). They are public directory entries; a speaker links their account
-- through the verified-email claim flow. Portraits are re-hosted in the
-- HashPass event-media bucket under events/cbweek2026/speakers/.
-- ============================================================================

BEGIN;

-- Same fix as V089: the original NULLS NOT DISTINCT constraint allows only one
-- organizer-managed (user_id IS NULL) speaker per event. Keep uniqueness for
-- linked accounts while allowing many unclaimed profiles.
ALTER TABLE public.speakers
  DROP CONSTRAINT IF EXISTS speakers_event_user_unique;
CREATE UNIQUE INDEX IF NOT EXISTS speakers_event_user_unique
  ON public.speakers (event_id, user_id)
  WHERE user_id IS NOT NULL;

WITH official (id, name, title, company, image_slug, sort_order) AS (
  VALUES
    ('5c0b2026-0c4b-4ee0-a7bf-202600000001', 'Daniel Acosta', 'Director Regional - América Latina', 'Binance', 'daniel-acosta', 1),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000002', 'Pedro Gutierrez', 'Senior BD Strategic Markets - LATAM', 'OKX', 'pedro-gutierrez', 2),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000003', 'Leonardo Fiorenza', 'Marketing Manager - LATAM', 'Bybit', 'leonardo-fiorenza', 3),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000004', 'Pedro Rojas', 'P2P Operation Manager - LATAM', 'MEXC', 'pedro-rojas', 4),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000005', 'Lesme Hernández', 'Regional Brand Manager LATAM', 'BingX', 'lesme-hernandez', 5),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000006', 'Jan Füllgraf', 'Regional Business Development Lead LATAM', 'Gate.io', 'jan-fullgraf', 6),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000007', 'Maria Pesca', 'Regional Director - LATAM', 'XS.com', 'maria-pesca', 7),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000008', 'Antonio Di Giacomo', 'Senior Market Analyst', 'XS.com', 'antonio-di-giacomo', 8),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000009', 'Alejandro Gomez', 'Business Development Manager', 'Wetrade', 'alejandro-gomez', 9),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000010', 'Agustina Laborda', 'Sales Manager', 'Wetrade', 'agustina-laborda', 10),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000011', 'Michel Cohen', 'Partnership Manager LATAM', 'PU Prime', 'michel-cohen', 11),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000012', 'Francisco Castro', 'CEO', 'Verem', 'francisco-castro', 12),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000013', 'Andre Gejde', 'Regional Growth Manager', 'Tangem', 'andre-gejde', 13),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000014', 'Carlos Neira', 'Co-Founder & CCO', 'Meru', 'carlos-neira', 14),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000015', 'Marco Kowalewski', 'Chief Communication Officer', 'Beldex', 'marco-kowalewski', 15),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000016', 'Tomás Henao', 'Head of Crypto', 'Trii', 'tomas-henao', 16),
    ('5c0b2026-0c4b-4ee0-a7bf-202600000017', 'Omar Arab', 'Co-Founder & Managing Director Latin America', 'Miami Fintech Club', 'omar-arab', 17)
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
  title || ' at ' || company || '. Official Colombia Blockchain Week 2026 speaker.',
  'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/cbweek2026/speakers/' || image_slug || '.webp',
  '{}'::jsonb,
  '{"is_active":true,"directory_visible":true,"is_official_2026_speaker":true,"source":"https://colombiablockchainweek.com/"}'::jsonb,
  sort_order
FROM official
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

COMMIT;
