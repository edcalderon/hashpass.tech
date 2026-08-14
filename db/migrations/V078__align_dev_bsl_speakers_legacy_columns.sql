-- ============================================================================
-- V078: Align bsl-development's bsl_speakers schema with bsl-production
-- ============================================================================
-- Confirmed 2026-08-14: every speaker-related API route (list, single-speaker
-- detail, admin/speaker-roles, meeting requests, profile/speaker, meeting
-- chat, notifications, my-meetings) selects `imageurl`/`linkedin`/`twitter`/
-- `tags`/`availability` -- the actual column names bsl-production's
-- bsl_speakers table has (alongside newer image_url/linkedin_url/twitter_url
-- columns that most rows also carry, but which the app code does not read).
-- bsl-development's bsl_speakers table never got these five columns, so any
-- of those routes 500'd on dev with "column does not exist" regardless of
-- row count -- reproduced directly via the dev API (500 on both
-- /api/events/criptolatinfest/speakers and /api/events/bsl2026/speakers) and
-- confirmed via a live `\d public.bsl_speakers` diff against bsl-production.
-- Same class of dev/prod schema divergence as V068/V069/V050/V051.
--
-- Purely additive; dev's bsl_speakers table is currently empty (0 rows), so
-- there is nothing to backfill.
-- ============================================================================

BEGIN;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS imageurl text,
  ADD COLUMN IF NOT EXISTS linkedin text,
  ADD COLUMN IF NOT EXISTS twitter text,
  ADD COLUMN IF NOT EXISTS tags text[],
  ADD COLUMN IF NOT EXISTS availability jsonb;

COMMIT;
