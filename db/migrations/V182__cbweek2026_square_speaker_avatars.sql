-- ============================================================================
-- V182: Use face-centred square avatars for the CBWeek 2026 speakers
-- ============================================================================
-- The official portraits are 1085x1645 speaker cards with a baked-in name
-- panel from 65% down. A circular `cover` crop of the card lands on the chest
-- and cuts the face. These square crops contain only the photo area (face
-- centred, no name panel or frame) and are stored beside the originals as
-- events/cbweek2026/speakers/{slug}-avatar.webp.
-- Scope: event_id = 'cbweek2026' only; BSL Colombia ('colombia2026') is
-- untouched.
-- ============================================================================

BEGIN;

UPDATE public.speakers
SET image_url = regexp_replace(image_url, '\.webp$', '-avatar.webp'),
    updated_at = now()
WHERE event_id = 'cbweek2026'
  AND metadata->>'is_official_2026_speaker' = 'true'
  AND image_url ~ '/events/cbweek2026/speakers/[a-z-]+\.webp$'
  AND image_url !~ '-avatar\.webp$'
  AND image_url !~ '/past-editions/';

COMMIT;
