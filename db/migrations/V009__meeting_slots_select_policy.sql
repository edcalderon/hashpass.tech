-- V009: Restore meeting_slots reads after V008 enabled RLS on it with no
-- policies.
--
-- Flagged by code review (chatgpt-codex-connector) on the V008 PR before
-- merge: meeting_slots had no pre-existing permissive policy (the schema
-- drift V008 was explicitly written to tolerate), so enabling RLS with zero
-- policies made it default-deny for every real caller, not just the public
-- anon-key path V008 was meant to close. Two legitimate authenticated
-- read paths broke:
--   - apps/mobile-app/app/events/[eventSlug]/my-bookings.tsx: a real
--     authenticated user (the shared client-side Supabase client, real
--     session, auth.uid() resolves) loading their own meetings and
--     embedding the linked slot via `slot:meeting_slots(*)`.
--   - apps/mobile-app/app/api/bslatam/bookings/[id]+api.ts: uses
--     getSupabaseServerForRequest(), which is the service-role client
--     (BYPASSRLS) — actually unaffected, listed here only because it does
--     the same embed; confirmed by reading lib/supabase-server.ts.
--
-- meeting_slots.meeting_id has no enforced FK to meetings.id, but
-- meetings.slot_id -> meeting_slots.id is a real FK (confirmed via \d on
-- both tables) and is what PostgREST's `slot:meeting_slots(*)` embed
-- actually resolves through, so the policy is written against that
-- direction: a row is visible if the querying user owns the slot directly,
-- or if a meetings row that references this slot lists them as requester,
-- host, or attendee — the exact same three columns meetings' own existing
-- "meetings_select_participant" policy already uses.
--
-- Not fixed here: apps/mobile-app/app/api/bslatam/meeting-slots/+api.ts
-- builds its own anon-key client with no session attached
-- (persistSession:false, no user JWT forwarded), so auth.uid() is NULL for
-- every request it makes — no SELECT policy tied to auth.uid() can serve it.
-- That endpoint already had no per-request identity check before this
-- migration (any caller can pass any userId query param), so moving it to
-- the service-role client (matching bookings/[id]+api.ts's existing pattern)
-- is a same-PR code change, not a database migration, and does not change
-- its access model — see that commit for the fix.

CREATE POLICY "meeting_slots_select_owner_or_participant" ON public.meeting_slots
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.meetings m
      WHERE m.slot_id = meeting_slots.id
        AND (m.requester_id = auth.uid() OR m.host_id = auth.uid() OR m.attendee_id = auth.uid())
    )
  );
