-- ============================================================================
-- V186: Give agenda items an explicit duration (CBWeek 2026 event blocks)
-- ============================================================================
-- event_agenda had no length, so the client assumed a per-type default (30 min
-- for 'networking'). The officially published CBWeek 2026 blocks are far longer
-- (Main Day 07:30-18:00 rendered as "7:30 AM - 8:00 AM"). The client already
-- honours item.duration_minutes; this adds the column and sets it for the two
-- real blocks. Scope: event_id = 'cbweek2026' only.
-- ============================================================================

BEGIN;

ALTER TABLE public.event_agenda
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.event_agenda
  DROP CONSTRAINT IF EXISTS event_agenda_duration_minutes_check;
ALTER TABLE public.event_agenda
  ADD CONSTRAINT event_agenda_duration_minutes_check
  CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440);

UPDATE public.event_agenda
SET duration_minutes = 270, updated_at = now()   -- 19:30 -> 00:00
WHERE event_id = 'cbweek2026' AND id = 'cbweek2026-official-welcome-drink';

UPDATE public.event_agenda
SET duration_minutes = 630, updated_at = now()   -- 07:30 -> 18:00
WHERE event_id = 'cbweek2026' AND id = 'cbweek2026-official-main-day';

COMMIT;
