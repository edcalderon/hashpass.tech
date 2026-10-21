-- ============================================================================
-- V124: Give core's bsl_speakers the event-scoped shape BSL production has
-- ============================================================================
-- 2026-10-20 decision: core (fxgftanraszjjyeidvia) is the single database for
-- every tenant and event; the BSL project (mnnqryrdlhddorqsrtbn) is retained
-- only as a read-only backup. Core's bsl_speakers is still the original
-- 15-column table, so V107..V116 (which assume slug/event_id/directory_visible
-- and friends) cannot run on it. This purely additive migration adds the
-- missing columns and must run BEFORE V107. The id column stays text (not
-- uuid) because meetings.speaker_id, bsl_bookings and user_blocks reference it
-- as text on core.
-- ============================================================================

BEGIN;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS twitter_url text,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS day text,
  ADD COLUMN IF NOT EXISTS day_name text,
  ADD COLUMN IF NOT EXISTS session_time text,
  ADD COLUMN IF NOT EXISTS session_title text,
  ADD COLUMN IF NOT EXISTS session_type text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS directory_visible boolean DEFAULT true;

-- BSL generates ids on insert; core's text id had no default.
ALTER TABLE public.bsl_speakers
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

COMMIT;
