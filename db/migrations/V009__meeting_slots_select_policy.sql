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
--   - apps/mobile-app/app/api/bsl/bookings/[id]+api.ts: uses
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
-- Not fixed here: apps/mobile-app/app/api/bsl/meeting-slots/+api.ts
-- builds its own anon-key client with no session attached
-- (persistSession:false, no user JWT forwarded), so auth.uid() is NULL for
-- every request it makes — no SELECT policy tied to auth.uid() can serve it.
-- That endpoint already had no per-request identity check before this
-- migration (any caller can pass any userId query param), so moving it to
-- the service-role client (matching bookings/[id]+api.ts's existing pattern)
-- is a same-PR code change, not a database migration, and does not change
-- its access model — see that commit for the fix.

-- Baseline schema this file (and V017 onward) assumes but which no earlier
-- migration ever created -- flagged by code review 2026-08-06: running
-- V000-V008 against a truly blank database never creates meeting_slots at
-- all, so this file's own policy below fails with "relation does not
-- exist" before this fix. meeting_slots and the meetings.slot_id/host_id/
-- attendee_id columns it's joined against here were both applied directly
-- to the live database at some point, out of band, same class of gap as
-- V000's Better Auth tables. Sourced from a live BSL prod schema dump
-- (pg_dump --schema-only, 2026-08-06) so a fresh bootstrap matches
-- production exactly rather than guessing. meeting_requests' own missing
-- columns/FKs are NOT added here -- V009 doesn't reference them, and
-- V032/V017+ already add what they individually need further down the
-- sequence.
CREATE TABLE IF NOT EXISTS public.meeting_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available',
  meeting_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_slots_status_check CHECK (status = ANY (ARRAY['available', 'booked', 'unavailable']))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_slots_user_start ON public.meeting_slots (user_id, start_time);

DO $$ BEGIN
  ALTER TABLE public.meeting_slots
    ADD CONSTRAINT meeting_slots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS slot_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS host_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS attendee_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS start_time timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS end_time timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS attendee_email text;

DO $$ BEGIN
  ALTER TABLE public.meetings
    ADD CONSTRAINT meetings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.meeting_slots(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.meetings
    ADD CONSTRAINT meetings_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.meetings
    ADD CONSTRAINT meetings_attendee_id_fkey FOREIGN KEY (attendee_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.meeting_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY meeting_slots_select_public ON public.meeting_slots FOR SELECT USING (true);

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
