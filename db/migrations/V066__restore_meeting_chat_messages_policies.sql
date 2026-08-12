-- dev's meeting_chat_messages was missing meeting_id, message_type, read_at,
-- the meeting_id FK/index, and both RLS policies, even though V053/V054
-- (which are supposed to fully define this table) show as applied in
-- hashpass_schema_migrations -- confirmed via direct schema comparison
-- during the 2026-08-11 schema audit (apps/docs/docs/infra/DATABASE_SCHEMA.md,
-- Finding 5). Net effect: the e2e encrypted meeting chat feature is
-- completely unusable on dev (RLS-enabled + zero policies denies all reads
-- and writes, even to legitimate participants).
--
-- Tracing the fix further surfaced a bigger, separate gap: dev's `meetings`
-- table itself is missing 7 columns that BOTH core prod and BSL prod have
-- (event_id, slot_id, host_id, attendee_id, start_time, end_time,
-- attendee_email -- the meeting_slots-based scheduling model, V009's
-- responsibility) -- and dev's existing meetings_select_participant /
-- meetings_update_participant policies call get_current_user_id(), a
-- function that reads the Postgres session variable app.user_id, which
-- nothing in the normal PostgREST/Supabase request path ever sets (unlike
-- auth.uid(), which resolves from the request JWT automatically). In
-- practice this means dev's meetings RLS was already effectively
-- unreachable for real authenticated requests before this fix, independent
-- of chat. 0 rows in both meetings and meeting_chat_messages on dev as of
-- 2026-08-11 (verified) -- zero data-loss risk either way.
--
-- All statements are idempotent (IF NOT EXISTS / DO-block existence
-- checks, DROP POLICY IF EXISTS before CREATE), so this is a safe no-op on
-- core prod and BSL prod, which already have the full correct shape.

-- ============================================================
-- Part 1: bring dev's `meetings` table up to the meeting_slots-based shape
-- ============================================================

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS event_id text NOT NULL DEFAULT 'bsl2025';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS slot_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS host_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS attendee_id uuid;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS start_time timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS end_time timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS attendee_email text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_slot_id_fkey') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.meeting_slots(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_host_id_fkey') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_attendee_id_fkey') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_attendee_id_fkey FOREIGN KEY (attendee_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meetings_host ON public.meetings (host_id);
CREATE INDEX IF NOT EXISTS idx_meetings_attendee ON public.meetings (attendee_id);

-- Rewrite meetings' own participant policies to match core prod/BSL prod:
-- auth.uid() (the function Supabase's request path actually populates) plus
-- host_id/attendee_id, not just requester_id/speaker_id via the dead
-- get_current_user_id(). DROP+CREATE since Postgres has no
-- CREATE OR REPLACE POLICY; safe to re-run.
DROP POLICY IF EXISTS meetings_select_participant ON public.meetings;
CREATE POLICY meetings_select_participant ON public.meetings
  FOR SELECT
  USING (
    requester_id = auth.uid()
    OR host_id = auth.uid()
    OR attendee_id = auth.uid()
    OR speaker_id IN (SELECT bsl_speakers.id FROM bsl_speakers WHERE bsl_speakers.user_id = auth.uid())
  );

DROP POLICY IF EXISTS meetings_update_participant ON public.meetings;
CREATE POLICY meetings_update_participant ON public.meetings
  FOR UPDATE
  USING (requester_id = auth.uid() OR host_id = auth.uid() OR attendee_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR host_id = auth.uid() OR attendee_id = auth.uid());

-- ============================================================
-- Part 2: bring dev's `meeting_chat_messages` table up to the V053/V054 shape
-- ============================================================

ALTER TABLE public.meeting_chat_messages ADD COLUMN IF NOT EXISTS meeting_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meeting_chat_messages_meeting_id_fkey'
  ) THEN
    ALTER TABLE public.meeting_chat_messages
      ADD CONSTRAINT meeting_chat_messages_meeting_id_fkey
      FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 0 rows on dev as of 2026-08-11 (verified) -- safe to set NOT NULL directly,
-- matching core prod/BSL prod's live shape. Guarded so it's a no-op if this
-- ever runs against a project where meeting_id is already NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_chat_messages'
      AND column_name = 'meeting_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.meeting_chat_messages ALTER COLUMN meeting_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.meeting_chat_messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE public.meeting_chat_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_meeting_chat_messages_meeting
  ON public.meeting_chat_messages (meeting_id);

-- Definitions copied verbatim from core prod/BSL prod's live pg_policies
-- (db/schema-snapshots/core-prod.sql reflects the same). meetings.speaker_id
-- and bsl_speakers.id are both `uuid` on dev (both `text` on core prod) --
-- internally consistent within each project, so this policy body is valid
-- unmodified on dev.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_chat_messages'
      AND policyname = 'meeting_chat_messages_select_participant'
  ) THEN
    CREATE POLICY meeting_chat_messages_select_participant
      ON public.meeting_chat_messages
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM meetings m
          WHERE m.id = meeting_chat_messages.meeting_id
            AND (
              m.requester_id = auth.uid()
              OR m.host_id = auth.uid()
              OR m.attendee_id = auth.uid()
              OR m.speaker_id IN (
                SELECT s.id FROM bsl_speakers s WHERE s.user_id = auth.uid()
              )
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'meeting_chat_messages'
      AND policyname = 'meeting_chat_messages_insert_participant'
  ) THEN
    CREATE POLICY meeting_chat_messages_insert_participant
      ON public.meeting_chat_messages
      FOR INSERT
      WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM meetings m
          WHERE m.id = meeting_chat_messages.meeting_id
            AND (
              m.requester_id = auth.uid()
              OR m.host_id = auth.uid()
              OR m.attendee_id = auth.uid()
              OR m.speaker_id IN (
                SELECT s.id FROM bsl_speakers s WHERE s.user_id = auth.uid()
              )
            )
        )
      );
  END IF;
END $$;

INSERT INTO hashpass_schema_migrations (id, file_path)
VALUES ('V066__restore_meeting_chat_messages_policies', 'db/migrations/V066__restore_meeting_chat_messages_policies.sql')
ON CONFLICT (id) DO NOTHING;
