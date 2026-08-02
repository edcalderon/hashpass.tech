-- Meeting requests, passes, and claimed speaker ownership all use Supabase
-- auth UUIDs. Older BSL bootstrap deployments incorrectly constrained the
-- request participants to public."user", whose IDs are a separate registry
-- domain. That made valid pass holders fail at INSERT with an FK violation.
--
-- Keep historical registry-backed rows readable while enforcing the correct
-- identity domain for every new request. Existing data can be reconciled and
-- validated separately without blocking this production repair.

BEGIN;

ALTER TABLE public.meeting_requests
  DROP CONSTRAINT IF EXISTS meeting_requests_requester_id_fkey,
  DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;

ALTER TABLE public.meeting_requests
  ADD CONSTRAINT meeting_requests_requester_id_fkey
    FOREIGN KEY (requester_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
    NOT VALID,
  ADD CONSTRAINT meeting_requests_speaker_id_fkey
    FOREIGN KEY (speaker_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
    NOT VALID;

COMMIT;
