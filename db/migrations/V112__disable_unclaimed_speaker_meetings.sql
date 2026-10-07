-- ============================================================================
-- V112: Keep published-but-unclaimed speaker profiles out of networking
-- ============================================================================
-- Public directory visibility does not grant meeting capability. The legacy
-- import defaulted is_accepting_meetings to true, so normalize the stored
-- capability for profiles that still have no linked account.
-- ============================================================================

BEGIN;

UPDATE public.bsl_speakers
   SET is_accepting_meetings = false,
       updated_at = now()
 WHERE directory_visible = true
   AND user_id IS NULL
   AND is_accepting_meetings IS DISTINCT FROM false;

COMMIT;
