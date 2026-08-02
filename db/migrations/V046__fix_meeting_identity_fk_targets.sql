-- accept_meeting_request has never successfully created a single meeting on
-- either dev or prod (both had zero rows in public.meetings before this
-- migration) because of a real, live identity-space mismatch: every
-- application code path that reads or writes meeting_slots.user_id,
-- meetings.requester_id/host_id/attendee_id, and user_agenda_status.user_id
-- treats them as Supabase auth.users ids (accept_meeting_request itself
-- inserts v_speaker.user_id/v_request.requester_id, both auth ids;
-- get_speaker_available_slots compares meeting_slots.user_id against
-- v_speaker.user_id and p_requester_id, both auth ids; my-schedule.tsx
-- queries user_agenda_status by dbUserId, the app's own auth-id convention)
-- -- but the FK constraints on these columns point at public.user(id) /
-- profiles(id), a completely different, independently-generated id space
-- (public.user.id only overlaps auth.users.id for zero of 124 rows,
-- confirmed live on both databases). Every insert attempt in
-- accept_meeting_request has therefore been silently doomed to fail its
-- foreign key check.
--
-- The 224 existing meeting_slots rows on prod that DO satisfy the old
-- public.user-targeted FK come from a dead, unreferenced legacy route
-- (app/api/bsl/meeting-slots/+api.ts, confirmed uncalled by any current
-- client code) and predate the app's current auth-id convention. Adding
-- these as NOT VALID (matching the existing precedent of
-- meeting_requests_requester_id_fkey/meeting_requests_speaker_id_fkey,
-- both already NOT VALID for the same reason) leaves that legacy data
-- alone rather than deleting it, while still enforcing the correct target
-- for every new row going forward.
--
-- Schema only -- no function bodies change. Note the exact set of
-- constraints present differs between dev and prod (schema drift already
-- present before this migration), so every DROP is IF EXISTS.

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_requester_id_fkey;
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_host_id_fkey;
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_attendee_id_fkey;

ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_attendee_id_fkey
  FOREIGN KEY (attendee_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.meeting_slots DROP CONSTRAINT IF EXISTS meeting_slots_user_id_fkey;
ALTER TABLE public.meeting_slots
  ADD CONSTRAINT meeting_slots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.user_agenda_status DROP CONSTRAINT IF EXISTS user_agenda_status_user_id_fkey;
ALTER TABLE public.user_agenda_status
  ADD CONSTRAINT user_agenda_status_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
