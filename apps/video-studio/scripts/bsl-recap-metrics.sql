-- Aggregate only. Do not select message bodies, ciphertext, emails or user IDs.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT json_build_object(
  'eventId', 'colombia2026',
  'cutoff', '2026-11-06T22:30:00Z',
  'counts', json_build_object(
    'newUsers', (SELECT count(*) FROM auth.users u
      WHERE u.created_at >= '2026-11-04T05:00:00Z' AND u.created_at < '2026-11-06T22:30:00Z'
      AND EXISTS (SELECT 1 FROM public.passes p WHERE p.user_id = u.id::text AND p.event_id = 'colombia2026')),
    'meetingRequests', (SELECT count(*) FROM public.meeting_requests
      WHERE event_id = 'colombia2026' AND created_at >= '2026-11-04T05:00:00Z' AND created_at < '2026-11-06T22:30:00Z'),
    'chatMessages', (SELECT count(*) FROM public.event_chat_messages
      WHERE event_id = 'colombia2026' AND created_at >= '2026-11-04T05:00:00Z' AND created_at < '2026-11-06T22:30:00Z')
      + (SELECT count(*) FROM public.meeting_chat_messages c JOIN public.meetings m ON m.id = c.meeting_id
      WHERE m.event_id = 'colombia2026' AND c.created_at >= '2026-11-04T05:00:00Z' AND c.created_at < '2026-11-06T22:30:00Z'),
    'agendaActions', (SELECT count(*) FROM public.marketing_activity
      WHERE event_id = 'colombia2026' AND source = 'verified_server'
      AND kind IN ('agenda_favorited', 'agenda_confirmed')
      AND created_at >= '2026-11-04T05:00:00Z' AND created_at < '2026-11-06T22:30:00Z')
  )
);
COMMIT;
