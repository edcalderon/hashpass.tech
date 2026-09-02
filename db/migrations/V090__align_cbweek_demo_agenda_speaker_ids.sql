-- Keep the already-applied CBWeek demo agenda references aligned with the
-- stable UUIDs in public.speakers. The event agenda stores speaker references
-- as text, while the event-scoped speaker API resolves public.speakers.id.

BEGIN;

UPDATE public.event_agenda
SET speakers = CASE id
  WHEN 'cbweek2026-demo-02' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201']::text[]
  WHEN 'cbweek2026-demo-03' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201']::text[]
  WHEN 'cbweek2026-demo-04' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201']::text[]
  WHEN 'cbweek2026-demo-06' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202']::text[]
  WHEN 'cbweek2026-demo-07' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203']::text[]
  WHEN 'cbweek2026-demo-08' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203']::text[]
  WHEN 'cbweek2026-demo-10' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203']::text[]
  WHEN 'cbweek2026-demo-11' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202']::text[]
  WHEN 'cbweek2026-demo-12' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203']::text[]
  WHEN 'cbweek2026-demo-13' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203']::text[]
  WHEN 'cbweek2026-demo-14' THEN ARRAY['90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201', '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202']::text[]
  ELSE speakers
END,
updated_at = now()
WHERE event_id = 'cbweek2026'
  AND id IN (
    'cbweek2026-demo-02', 'cbweek2026-demo-03', 'cbweek2026-demo-04',
    'cbweek2026-demo-06', 'cbweek2026-demo-07', 'cbweek2026-demo-08',
    'cbweek2026-demo-10', 'cbweek2026-demo-11', 'cbweek2026-demo-12',
    'cbweek2026-demo-13', 'cbweek2026-demo-14'
  );

COMMIT;
