-- ============================================================================
-- V118: Ensure event-scoped meeting request storage exists
-- ============================================================================
-- A development tenant can have the older meeting_requests shape even though
-- its event-scoped RPCs are present. Keep the column addition idempotent so
-- both legacy enum and current text-status schemas can use the same RPC.

BEGIN;

ALTER TABLE public.meeting_requests
  ADD COLUMN IF NOT EXISTS event_id text NOT NULL DEFAULT 'bsl2025';

COMMIT;
