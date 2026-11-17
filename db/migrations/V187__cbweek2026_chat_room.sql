-- ============================================================================
-- V187: Register the CBWeek 2026 event chat room in every environment
-- ============================================================================
-- GET /api/events/cbweek2026/chat?channel=room returned 404 ("This event room is
-- unavailable") in production: the chat API resolves the room through
-- public.event_chat_rooms (V073), and the cbweek2026 row was only inserted by
-- V096, which lives in the development-only demo-event-bootstrap group. The
-- production profile therefore never created it.
-- Scope: event_id = 'cbweek2026' ONLY. Other events' rooms are untouched.
-- ============================================================================

BEGIN;

INSERT INTO public.event_chat_rooms (event_id)
SELECT id FROM public.events WHERE id = 'cbweek2026' AND status = 'published'
ON CONFLICT (event_id) DO NOTHING;

COMMIT;
