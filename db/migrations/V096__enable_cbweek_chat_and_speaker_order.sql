BEGIN;

INSERT INTO public.event_chat_rooms (event_id)
SELECT id FROM public.events WHERE id = 'cbweek2026' AND status = 'published'
ON CONFLICT (event_id) DO NOTHING;

UPDATE public.speakers
SET sort_order = CASE id
  WHEN '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202' THEN 10
  WHEN '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201' THEN 20
  WHEN '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203' THEN 30
END
WHERE event_id = 'cbweek2026'
  AND id IN (
    '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6202',
    '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6201',
    '90e7014d-0d4b-4ee0-a7bf-b5f3b8db6203'
  );

COMMIT;
