-- Target BSL bootstrap
-- Idempotent schema + RPC compatibility layer for the target Supabase database.
-- This keeps the current app working while the hosting stack moves off Amplify.

BEGIN;

-- ============================================================================
-- Helpers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_public_user_to_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    company,
    title,
    bio,
    phone,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(NEW.full_name, ''),
      NULLIF(NEW.profile_metadata->>'full_name', ''),
      NULLIF(trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), '')
    ),
    NEW.avatar_url,
    NULLIF(NEW.profile_metadata->>'company', ''),
    NULLIF(NEW.profile_metadata->>'title', ''),
    NULLIF(NEW.profile_metadata->>'bio', ''),
    NEW.phone,
    COALESCE(NEW.profile_metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    company = COALESCE(EXCLUDED.company, public.profiles.company),
    title = COALESCE(EXCLUDED.title, public.profiles.title),
    bio = COALESCE(EXCLUDED.bio, public.profiles.bio),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    metadata = COALESCE(public.profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_user_profiles_to_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    company,
    title,
    bio,
    phone,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    NEW.user_id,
    NEW.email,
    COALESCE(NULLIF(NEW.full_name, ''), NULLIF(NEW.display_name, '')),
    NEW.avatar_url,
    NULLIF(NEW.company, ''),
    NULLIF(NEW.title, ''),
    NULLIF(NEW.bio, ''),
    NEW.phone,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    company = COALESCE(EXCLUDED.company, public.profiles.company),
    title = COALESCE(EXCLUDED.title, public.profiles.title),
    bio = COALESCE(EXCLUDED.bio, public.profiles.bio),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    metadata = COALESCE(public.profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Core support tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  email text UNIQUE,
  full_name text,
  avatar_url text,
  company text,
  title text,
  bio text,
  phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  full_name text,
  display_name text,
  avatar_url text,
  company text,
  title text,
  bio text,
  wallet_address text,
  email text,
  phone text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bsl_speakers'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.bsl_speakers ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bsl_speakers'
      AND column_name = 'is_accepting_meetings'
  ) THEN
    ALTER TABLE public.bsl_speakers ADD COLUMN is_accepting_meetings boolean NOT NULL DEFAULT true;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_agenda (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id text NOT NULL DEFAULT 'bsl2025',
  time timestamptz NOT NULL,
  title text NOT NULL,
  description text,
  speakers text[],
  type text CHECK (type IN ('keynote', 'panel', 'workshop', 'networking', 'break')),
  location text,
  day text,
  day_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('meeting_request', 'meeting_accepted', 'meeting_declined', 'meeting_reminder', 'meeting_expired', 'meeting_cancelled', 'boost_received', 'system_alert', 'chat_message')),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  is_urgent boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  meeting_request_id uuid,
  speaker_id text,
  meeting_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  event_id text NOT NULL DEFAULT 'bsl2025',
  speaker_name text NOT NULL,
  requester_name text,
  requester_company text,
  requester_title text,
  requester_ticket_type text CHECK (requester_ticket_type IN ('general', 'business', 'vip')),
  preferred_date text,
  preferred_time text,
  duration_minutes integer NOT NULL DEFAULT 15,
  meeting_type text NOT NULL DEFAULT 'networking',
  message text NOT NULL DEFAULT '',
  note text,
  boost_amount numeric(10,2) NOT NULL DEFAULT 0,
  boost_transaction_hash text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requested', 'approved', 'accepted', 'declined', 'rejected', 'expired', 'cancelled', 'completed', 'confirmed')),
  priority_score integer NOT NULL DEFAULT 50,
  availability_window_start timestamptz,
  availability_window_end timestamptz,
  scheduled_at timestamptz,
  meeting_scheduled_at timestamptz,
  meeting_location text,
  location text,
  meeting_link text,
  meeting_id uuid,
  speaker_response text,
  speaker_response_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id uuid REFERENCES public.meeting_requests(id) ON DELETE SET NULL,
  event_id text NOT NULL DEFAULT 'bsl2025',
  slot_id uuid REFERENCES public.meeting_slots(id) ON DELETE SET NULL,
  speaker_id text NOT NULL REFERENCES public.bsl_speakers(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  speaker_name text NOT NULL,
  requester_name text,
  meeting_type text NOT NULL DEFAULT 'networking',
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected')),
  scheduled_at timestamptz NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 15,
  location text,
  meeting_link text,
  notes text,
  title text,
  description text,
  attendee_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.speaker_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL DEFAULT 'bsl2025',
  speaker_id text NOT NULL REFERENCES public.bsl_speakers(id) ON DELETE CASCADE,
  speaker_name text NOT NULL,
  date date NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 15,
  max_meetings_per_slot integer NOT NULL DEFAULT 1,
  current_meetings_count integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  requires_vip_ticket boolean NOT NULL DEFAULT false,
  requires_business_ticket boolean NOT NULL DEFAULT false,
  allows_general_ticket boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_request_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  event_id text NOT NULL DEFAULT 'bsl2025',
  ticket_type text NOT NULL DEFAULT 'general' CHECK (ticket_type IN ('general', 'business', 'vip')),
  total_requests_sent integer NOT NULL DEFAULT 0,
  successful_requests integer NOT NULL DEFAULT 0,
  rejected_requests integer NOT NULL DEFAULT 0,
  last_request_at timestamptz,
  next_request_allowed_at timestamptz,
  total_boosts_used integer NOT NULL DEFAULT 0,
  total_boost_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS public.boost_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id uuid REFERENCES public.meeting_requests(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  token_symbol text NOT NULL DEFAULT 'VOI',
  transaction_hash text,
  block_number integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  confirmation_count integer NOT NULL DEFAULT 0,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.speed_dating_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_request_id uuid REFERENCES public.meeting_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  chat_duration_minutes integer NOT NULL DEFAULT 15,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.speed_dating_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'text',
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_last_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_agenda_status'
      AND column_name = 'meeting_id'
  ) THEN
    ALTER TABLE public.user_agenda_status ADD COLUMN meeting_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'user_agenda_status'
      AND constraint_name = 'user_agenda_status_user_slot_key'
  ) THEN
    ALTER TABLE public.user_agenda_status
      ADD CONSTRAINT user_agenda_status_user_slot_key UNIQUE (user_id, slot_time);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_blocks'
      AND column_name = 'blocker_user_id'
  ) THEN
    ALTER TABLE public.user_blocks ADD COLUMN blocker_user_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_blocks'
      AND column_name = 'is_muted'
  ) THEN
    ALTER TABLE public.user_blocks ADD COLUMN is_muted boolean NOT NULL DEFAULT false;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_requests_unique_active
  ON public.meeting_requests (event_id, requester_id, speaker_id)
  WHERE status IN ('pending', 'requested', 'approved', 'accepted');

CREATE INDEX IF NOT EXISTS idx_meeting_requests_requester ON public.meeting_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_speaker ON public.meeting_requests (speaker_id);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_status ON public.meeting_requests (status);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_expires_at ON public.meeting_requests (expires_at)
  WHERE status IN ('pending', 'requested', 'approved', 'accepted');

CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_slots_user_start
  ON public.meeting_slots (user_id, start_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_blocks_blocker_blocked
  ON public.user_blocks (blocker_user_id, blocked_user_id)
  WHERE blocker_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_blocks_speaker_blocked
  ON public.user_blocks (speaker_id, blocked_user_id)
  WHERE speaker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_requester ON public.meetings (requester_id);
CREATE INDEX IF NOT EXISTS idx_meetings_host ON public.meetings (host_id);
CREATE INDEX IF NOT EXISTS idx_meetings_attendee ON public.meetings (attendee_id);
CREATE INDEX IF NOT EXISTS idx_meetings_speaker ON public.meetings (speaker_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON public.meetings (scheduled_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_speaker_availability_unique
  ON public.speaker_availability (event_id, speaker_id, date, start_time);

CREATE INDEX IF NOT EXISTS idx_user_request_limits_user_event ON public.user_request_limits (user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_boost_transactions_request ON public.boost_transactions (meeting_request_id);
CREATE INDEX IF NOT EXISTS idx_speed_dating_chats_user ON public.speed_dating_chats (user_id);
CREATE INDEX IF NOT EXISTS idx_speed_dating_chats_speaker ON public.speed_dating_chats (speaker_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON public.chat_messages (chat_id);
CREATE INDEX IF NOT EXISTS idx_meeting_chat_messages_meeting ON public.meeting_chat_messages (meeting_id);
CREATE INDEX IF NOT EXISTS idx_chat_last_seen_meeting_user ON public.chat_last_seen (meeting_id, user_id);

DROP VIEW IF EXISTS public."BSL_Bookings";
DROP VIEW IF EXISTS public."BSL_Tickets";
DROP VIEW IF EXISTS public."BSL_Audit";

CREATE OR REPLACE VIEW public."BSL_Bookings" AS
SELECT
  id,
  speakerid AS "speakerId",
  attendeeid AS "attendeeId",
  start AS "start",
  "end" AS "end",
  status,
  createdat AS "createdAt"
FROM public.bsl_bookings;

CREATE OR REPLACE VIEW public."BSL_Tickets" AS
SELECT
  ticketid AS "ticketId",
  userid AS "userId",
  verified,
  used,
  issuedat AS "issuedAt",
  verifiedat AS "verifiedAt"
FROM public.bsl_tickets;

CREATE OR REPLACE VIEW public."BSL_Audit" AS
SELECT
  id,
  event,
  ref_id,
  actor,
  metadata,
  created_at AS "createdAt"
FROM public.bsl_audit;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speaker_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_request_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speed_dating_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_last_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
CREATE POLICY user_profiles_select_own ON public.user_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_insert_own ON public.user_profiles;
CREATE POLICY user_profiles_insert_own ON public.user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_update_own ON public.user_profiles;
CREATE POLICY user_profiles_update_own ON public.user_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_delete_own ON public.user_profiles;
CREATE POLICY user_profiles_delete_own ON public.user_profiles
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS event_agenda_public_read ON public.event_agenda;
CREATE POLICY event_agenda_public_read ON public.event_agenda
  FOR SELECT USING (true);

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_insert_service ON public.notifications;
CREATE POLICY notifications_insert_service ON public.notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own ON public.user_blocks
  FOR SELECT USING (
    blocker_user_id = auth.uid()
    OR speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own ON public.user_blocks
  FOR INSERT WITH CHECK (
    blocker_user_id = auth.uid()
    OR speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS user_blocks_update_own ON public.user_blocks;
CREATE POLICY user_blocks_update_own ON public.user_blocks
  FOR UPDATE USING (
    blocker_user_id = auth.uid()
    OR speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    blocker_user_id = auth.uid()
    OR speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own ON public.user_blocks
  FOR DELETE USING (
    blocker_user_id = auth.uid()
    OR speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS meeting_requests_select_participant ON public.meeting_requests;
CREATE POLICY meeting_requests_select_participant ON public.meeting_requests
  FOR SELECT USING (requester_id = auth.uid() OR speaker_id = auth.uid());

DROP POLICY IF EXISTS meeting_requests_insert_requester ON public.meeting_requests;
CREATE POLICY meeting_requests_insert_requester ON public.meeting_requests
  FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS meeting_requests_update_participant ON public.meeting_requests;
CREATE POLICY meeting_requests_update_participant ON public.meeting_requests
  FOR UPDATE USING (requester_id = auth.uid() OR speaker_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR speaker_id = auth.uid());

DROP POLICY IF EXISTS meeting_requests_delete_requester ON public.meeting_requests;
CREATE POLICY meeting_requests_delete_requester ON public.meeting_requests
  FOR DELETE USING (requester_id = auth.uid());

DROP POLICY IF EXISTS meetings_select_participant ON public.meetings;
CREATE POLICY meetings_select_participant ON public.meetings
  FOR SELECT USING (
    requester_id = auth.uid()
    OR host_id = auth.uid()
    OR attendee_id = auth.uid()
    OR speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS meetings_update_participant ON public.meetings;
CREATE POLICY meetings_update_participant ON public.meetings
  FOR UPDATE USING (
    requester_id = auth.uid()
    OR host_id = auth.uid()
    OR attendee_id = auth.uid()
  )
  WITH CHECK (
    requester_id = auth.uid()
    OR host_id = auth.uid()
    OR attendee_id = auth.uid()
  );

DROP POLICY IF EXISTS speaker_availability_select_public ON public.speaker_availability;
CREATE POLICY speaker_availability_select_public ON public.speaker_availability
  FOR SELECT USING (true);

DROP POLICY IF EXISTS speaker_availability_manage_own ON public.speaker_availability;
CREATE POLICY speaker_availability_manage_own ON public.speaker_availability
  FOR ALL USING (speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid()))
  WITH CHECK (speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS user_request_limits_select_own ON public.user_request_limits;
CREATE POLICY user_request_limits_select_own ON public.user_request_limits
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_request_limits_update_own ON public.user_request_limits;
CREATE POLICY user_request_limits_update_own ON public.user_request_limits
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS boost_transactions_select_own ON public.boost_transactions;
CREATE POLICY boost_transactions_select_own ON public.boost_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.meeting_requests mr
      WHERE mr.id = boost_transactions.meeting_request_id
        AND mr.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS speed_dating_chats_select_participant ON public.speed_dating_chats;
CREATE POLICY speed_dating_chats_select_participant ON public.speed_dating_chats
  FOR SELECT USING (user_id = auth.uid() OR speaker_id = auth.uid());

DROP POLICY IF EXISTS speed_dating_chats_insert_participant ON public.speed_dating_chats;
CREATE POLICY speed_dating_chats_insert_participant ON public.speed_dating_chats
  FOR INSERT WITH CHECK (user_id = auth.uid() OR speaker_id = auth.uid());

DROP POLICY IF EXISTS speed_dating_chats_update_participant ON public.speed_dating_chats;
CREATE POLICY speed_dating_chats_update_participant ON public.speed_dating_chats
  FOR UPDATE USING (user_id = auth.uid() OR speaker_id = auth.uid())
  WITH CHECK (user_id = auth.uid() OR speaker_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_select_participant ON public.chat_messages;
CREATE POLICY chat_messages_select_participant ON public.chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.speed_dating_chats c
      WHERE c.id = chat_messages.chat_id
        AND (c.user_id = auth.uid() OR c.speaker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS chat_messages_insert_participant ON public.chat_messages;
CREATE POLICY chat_messages_insert_participant ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.speed_dating_chats c
      WHERE c.id = chat_messages.chat_id
        AND (c.user_id = auth.uid() OR c.speaker_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS meeting_chat_messages_select_participant ON public.meeting_chat_messages;
CREATE POLICY meeting_chat_messages_select_participant ON public.meeting_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE m.id = meeting_chat_messages.meeting_id
        AND (
          m.requester_id = auth.uid()
          OR m.host_id = auth.uid()
          OR m.attendee_id = auth.uid()
          OR m.speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS meeting_chat_messages_insert_participant ON public.meeting_chat_messages;
CREATE POLICY meeting_chat_messages_insert_participant ON public.meeting_chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE m.id = meeting_chat_messages.meeting_id
        AND (
          m.requester_id = auth.uid()
          OR m.host_id = auth.uid()
          OR m.attendee_id = auth.uid()
          OR m.speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS chat_last_seen_select_own ON public.chat_last_seen;
CREATE POLICY chat_last_seen_select_own ON public.chat_last_seen
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_last_seen_insert_own ON public.chat_last_seen;
CREATE POLICY chat_last_seen_insert_own ON public.chat_last_seen
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_last_seen_update_own ON public.chat_last_seen;
CREATE POLICY chat_last_seen_update_own ON public.chat_last_seen
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Backfill
-- ============================================================================

INSERT INTO public.profiles (
  id, email, full_name, avatar_url, company, title, bio, phone, metadata, created_at, updated_at
)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(u.full_name, ''),
    NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
  ),
  u.avatar_url,
  NULLIF(u.profile_metadata->>'company', ''),
  NULLIF(u.profile_metadata->>'title', ''),
  NULLIF(u.profile_metadata->>'bio', ''),
  u.phone,
  COALESCE(u.profile_metadata, '{}'::jsonb),
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public."user" u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
  company = COALESCE(EXCLUDED.company, public.profiles.company),
  title = COALESCE(EXCLUDED.title, public.profiles.title),
  bio = COALESCE(EXCLUDED.bio, public.profiles.bio),
  phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
  metadata = COALESCE(public.profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
  updated_at = now();

INSERT INTO public.user_profiles (
  user_id, full_name, display_name, avatar_url, company, title, bio, wallet_address, email, phone, metadata, created_at, updated_at
)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.full_name, ''),
    NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
  ),
  COALESCE(
    NULLIF(u.full_name, ''),
    NULLIF(trim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
  ),
  u.avatar_url,
  NULLIF(u.profile_metadata->>'company', ''),
  NULLIF(u.profile_metadata->>'title', ''),
  NULLIF(u.profile_metadata->>'bio', ''),
  NULL,
  u.email,
  u.phone,
  COALESCE(u.profile_metadata, '{}'::jsonb),
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public."user" u
ON CONFLICT (user_id) DO UPDATE SET
  full_name = COALESCE(EXCLUDED.full_name, public.user_profiles.full_name),
  display_name = COALESCE(EXCLUDED.display_name, public.user_profiles.display_name),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.user_profiles.avatar_url),
  company = COALESCE(EXCLUDED.company, public.user_profiles.company),
  title = COALESCE(EXCLUDED.title, public.user_profiles.title),
  bio = COALESCE(EXCLUDED.bio, public.user_profiles.bio),
  email = COALESCE(EXCLUDED.email, public.user_profiles.email),
  phone = COALESCE(EXCLUDED.phone, public.user_profiles.phone),
  metadata = COALESCE(public.user_profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
  updated_at = now();

-- Keep the read model in sync after the backfill.
DROP TRIGGER IF EXISTS trg_public_user_sync_profiles ON public."user";
CREATE TRIGGER trg_public_user_sync_profiles
  AFTER INSERT OR UPDATE ON public."user"
  FOR EACH ROW EXECUTE FUNCTION public.sync_public_user_to_profiles();

DROP TRIGGER IF EXISTS trg_user_profiles_sync_profiles ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_sync_profiles
  AFTER INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_profiles_to_profiles();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_event_agenda_updated_at ON public.event_agenda;
CREATE TRIGGER trg_event_agenda_updated_at
  BEFORE UPDATE ON public.event_agenda
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_meeting_requests_updated_at ON public.meeting_requests;
CREATE TRIGGER trg_meeting_requests_updated_at
  BEFORE UPDATE ON public.meeting_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_speaker_availability_updated_at ON public.speaker_availability;
CREATE TRIGGER trg_speaker_availability_updated_at
  BEFORE UPDATE ON public.speaker_availability
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_request_limits_updated_at ON public.user_request_limits;
CREATE TRIGGER trg_user_request_limits_updated_at
  BEFORE UPDATE ON public.user_request_limits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_boost_transactions_updated_at ON public.boost_transactions;
CREATE TRIGGER trg_boost_transactions_updated_at
  BEFORE UPDATE ON public.boost_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_speed_dating_chats_updated_at ON public.speed_dating_chats;
CREATE TRIGGER trg_speed_dating_chats_updated_at
  BEFORE UPDATE ON public.speed_dating_chats
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_chat_last_seen_updated_at ON public.chat_last_seen;
CREATE TRIGGER trg_chat_last_seen_updated_at
  BEFORE UPDATE ON public.chat_last_seen
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================================
-- RPC helpers
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_speaker_by_id_or_slug(text);
CREATE OR REPLACE FUNCTION public.get_speaker_by_id_or_slug(p_id text)
RETURNS TABLE (
  id text,
  name text,
  title text,
  company text,
  bio text,
  imageurl text,
  linkedin text,
  twitter text,
  tags text[],
  availability jsonb,
  user_id uuid,
  is_active boolean,
  is_accepting_meetings boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.title,
    s.company,
    s.bio,
    s.imageurl,
    s.linkedin,
    s.twitter,
    s.tags,
    s.availability,
    s.user_id,
    s.is_active,
    s.is_accepting_meetings,
    s.created_at,
    s.updated_at
  FROM public.bsl_speakers s
  WHERE s.id = p_id
     OR lower(s.name) = lower(p_id)
     OR s.user_id::text = p_id
  LIMIT 1;
END;
$$;

DROP FUNCTION IF EXISTS public.is_speaker_active(text);
CREATE OR REPLACE FUNCTION public.is_speaker_active(p_speaker_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  RETURN COALESCE(v_speaker.is_active, false);
END;
$$;

DROP FUNCTION IF EXISTS public.is_speaker_online(text);
CREATE OR REPLACE FUNCTION public.is_speaker_online(p_speaker_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_last_sign_in timestamptz;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(v_speaker.is_active, false) THEN
    RETURN false;
  END IF;

  SELECT last_sign_in_at INTO v_last_sign_in
  FROM auth.users
  WHERE id = v_speaker.user_id;

  RETURN v_last_sign_in IS NOT NULL AND v_last_sign_in > now() - interval '5 minutes';
END;
$$;

DROP FUNCTION IF EXISTS public.get_pass_type_limits(text);
CREATE OR REPLACE FUNCTION public.get_pass_type_limits(p_pass_type text)
RETURNS TABLE (
  max_requests integer,
  max_boost integer,
  daily_limit integer,
  weekly_limit integer,
  monthly_limit integer
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_pass_type
      WHEN 'vip' THEN 100
      WHEN 'business' THEN 50
      ELSE 10
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 1000
      WHEN 'business' THEN 500
      ELSE 100
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 20
      WHEN 'business' THEN 10
      ELSE 3
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 100
      WHEN 'business' THEN 50
      ELSE 10
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 300
      WHEN 'business' THEN 150
      ELSE 30
    END;
END;
$$;

DROP FUNCTION IF EXISTS public.create_default_pass(text, text);
CREATE OR REPLACE FUNCTION public.create_default_pass(
  p_user_id text,
  p_pass_type text DEFAULT 'general'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
  v_pass_id text;
  v_max_requests integer;
  v_max_boost integer;
  v_existing_id text;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.passes
  WHERE user_id = p_user_id
    AND event_id = v_event_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT max_requests, max_boost INTO v_max_requests, v_max_boost
  FROM public.get_pass_type_limits(p_pass_type)
  LIMIT 1;

  INSERT INTO public.passes (
    user_id,
    event_id,
    pass_type,
    status,
    pass_number,
    max_meeting_requests,
    used_meeting_requests,
    max_boost_amount,
    used_boost_amount,
    access_features,
    special_perks
  ) VALUES (
    p_user_id,
    v_event_id,
    p_pass_type::pass_type,
    'active',
    'BSL-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    COALESCE(v_max_requests, 10),
    0,
    COALESCE(v_max_boost, 100),
    0,
    CASE p_pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE p_pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  )
  RETURNING id INTO v_pass_id;

  RETURN v_pass_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_user_meeting_request_counts(text);
CREATE OR REPLACE FUNCTION public.get_user_meeting_request_counts(p_user_id text)
RETURNS TABLE (
  total_requests bigint,
  accepted_requests bigint,
  approved_requests bigint,
  pending_requests bigint,
  declined_requests bigint,
  cancelled_requests bigint,
  remaining_requests integer,
  remaining_boost numeric,
  max_requests integer,
  max_boost numeric,
  pass_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
  v_pass RECORD;
  v_total bigint := 0;
  v_accepted bigint := 0;
  v_approved bigint := 0;
  v_pending bigint := 0;
  v_declined bigint := 0;
  v_cancelled bigint := 0;
BEGIN
  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.max_boost_amount,
    p.used_meeting_requests,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('pending', 'requested'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint
  INTO v_total, v_accepted, v_approved, v_pending, v_declined, v_cancelled
  FROM public.meeting_requests
  WHERE requester_id::text = p_user_id
    AND event_id = v_event_id
    AND status NOT IN ('cancelled', 'expired');

  RETURN QUERY
  SELECT
    v_total,
    v_accepted,
    v_approved,
    v_pending,
    v_declined,
    v_cancelled,
    GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - v_total::int),
    GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)),
    COALESCE(v_pass.max_meeting_requests, 0),
    COALESCE(v_pass.max_boost_amount, 0),
    COALESCE(v_pass.pass_type, 'general');
END;
$$;

DROP FUNCTION IF EXISTS public.can_send_meeting_request(text, text, text);
CREATE OR REPLACE FUNCTION public.can_send_meeting_request(
  p_user_id text,
  p_event_id text,
  p_ticket_type text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts RECORD;
BEGIN
  PERFORM 1
  FROM public.passes
  WHERE user_id = p_user_id
    AND event_id = COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'))
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_counts
  FROM public.get_user_meeting_request_counts(p_user_id)
  LIMIT 1;

  RETURN COALESCE(v_counts.remaining_requests, 0) > 0;
END;
$$;

DROP FUNCTION IF EXISTS public.can_make_meeting_request(text, text, numeric, text);
CREATE OR REPLACE FUNCTION public.can_make_meeting_request(
  p_user_id text,
  p_speaker_id text,
  p_boost_amount numeric DEFAULT 0,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  can_request boolean,
  reason text,
  pass_type text,
  remaining_requests integer,
  remaining_boost numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'));
  v_speaker RECORD;
  v_pass RECORD;
  v_existing_request RECORD;
  v_blocked boolean := false;
  v_remaining_requests integer := 0;
  v_remaining_boost numeric := 0;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN QUERY SELECT false, 'speaker_not_found', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.used_meeting_requests,
    p.max_boost_amount,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pass.id IS NULL THEN
    RETURN QUERY SELECT false, 'no_valid_pass', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_active, false) THEN
    RETURN QUERY SELECT false, 'speaker_inactive', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN QUERY SELECT false, 'not_accepting_meetings', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  v_remaining_requests := GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - (
    SELECT COUNT(*)
    FROM public.meeting_requests mr
    WHERE mr.requester_id::text = p_user_id
      AND mr.event_id = v_event_id
      AND mr.status NOT IN ('cancelled', 'expired')
  ));
  v_remaining_boost := GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0));

  SELECT * INTO v_existing_request
  FROM public.meeting_requests mr
  WHERE mr.requester_id::text = p_user_id
    AND mr.speaker_id::text = v_speaker.user_id::text
    AND mr.event_id = v_event_id
    AND mr.status IN ('pending', 'requested', 'approved', 'accepted')
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'existing_request', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks ub
    WHERE (
      ub.blocked_user_id = p_user_id::uuid
      AND (
        ub.speaker_id = v_speaker.id
        OR ub.blocker_user_id = v_speaker.user_id
      )
    )
    OR (
      ub.blocker_user_id = p_user_id::uuid
      AND ub.blocked_user_id = v_speaker.user_id
    )
  ) INTO v_blocked;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF v_remaining_requests <= 0 THEN
    RETURN QUERY SELECT false, 'no_requests_remaining', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF p_boost_amount > v_remaining_boost THEN
    RETURN QUERY SELECT false, 'insufficient_boost', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
END;
$$;

DROP FUNCTION IF EXISTS public.insert_meeting_request(text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz);
CREATE OR REPLACE FUNCTION public.insert_meeting_request(
  p_requester_id text,
  p_speaker_id text,
  p_speaker_name text,
  p_requester_name text,
  p_requester_company text,
  p_requester_title text,
  p_requester_ticket_type text,
  p_meeting_type text,
  p_message text,
  p_note text DEFAULT NULL,
  p_boost_amount numeric DEFAULT 0,
  p_duration_minutes integer DEFAULT 15,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  requester_id uuid,
  speaker_id uuid,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_request_id uuid := gen_random_uuid();
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RAISE EXCEPTION 'Speaker not found';
  END IF;

  IF NOT COALESCE((SELECT can_request FROM public.can_make_meeting_request(p_requester_id, p_speaker_id, COALESCE(p_boost_amount, 0), v_event_id) LIMIT 1), false) THEN
    RAISE EXCEPTION 'Meeting request not allowed';
  END IF;

  INSERT INTO public.meeting_requests (
    id,
    requester_id,
    speaker_id,
    event_id,
    speaker_name,
    requester_name,
    requester_company,
    requester_title,
    requester_ticket_type,
    meeting_type,
    message,
    note,
    boost_amount,
    duration_minutes,
    expires_at,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_request_id,
    p_requester_id::uuid,
    v_speaker.user_id,
    v_event_id,
    p_speaker_name,
    p_requester_name,
    p_requester_company,
    p_requester_title,
    p_requester_ticket_type,
    COALESCE(NULLIF(p_meeting_type, ''), 'networking'),
    COALESCE(p_message, ''),
    p_note,
    COALESCE(p_boost_amount, 0),
    COALESCE(p_duration_minutes, 15),
    COALESCE(p_expires_at, now() + interval '3 days'),
    'pending',
    now(),
    now()
  );

  PERFORM public.create_notification(
    p_requester_id::uuid,
    'meeting_request',
    'Request Sent',
    'Your meeting request to ' || p_speaker_name || ' has been sent.',
    v_request_id,
    v_speaker.id,
    false,
    NULL
  );

  PERFORM public.send_prioritized_notification(
    v_speaker.id,
    p_requester_name,
    p_requester_company,
    p_requester_ticket_type,
    COALESCE(p_boost_amount, 0),
    v_request_id
  );

  RETURN QUERY
  SELECT v_request_id, p_requester_id::uuid, v_speaker.user_id, 'pending', now();
END;
$$;

DROP FUNCTION IF EXISTS public.get_meeting_requests_for_speaker(text, text);
CREATE OR REPLACE FUNCTION public.get_meeting_requests_for_speaker(
  p_user_id text,
  p_speaker_id text
)
RETURNS SETOF public.meeting_requests
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT mr.*
  FROM public.meeting_requests mr
  WHERE mr.event_id = v_event_id
    AND (
      mr.requester_id::text = p_user_id
      OR mr.speaker_id = v_speaker.user_id
    )
  ORDER BY mr.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.generate_weekly_slots(text, date);
CREATE OR REPLACE FUNCTION public.generate_weekly_slots(
  p_user_id text,
  p_start_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_day integer;
  v_slot timestamptz;
  v_count integer := 0;
BEGIN
  DELETE FROM public.meeting_slots
  WHERE user_id = p_user_id::uuid
    AND start_time >= p_start_date::timestamptz
    AND status <> 'booked';

  FOR v_day IN 0..6 LOOP
    v_slot := (p_start_date + v_day)::timestamptz + interval '9 hours';
    WHILE v_slot < (p_start_date + v_day)::timestamptz + interval '17 hours' LOOP
      INSERT INTO public.meeting_slots (user_id, start_time, end_time, status)
      VALUES (p_user_id::uuid, v_slot, v_slot + interval '15 minutes', 'available')
      ON CONFLICT (user_id, start_time) DO UPDATE SET
        end_time = EXCLUDED.end_time,
        status = CASE WHEN public.meeting_slots.status = 'booked' THEN public.meeting_slots.status ELSE 'available' END,
        updated_at = now();
      v_count := v_count + 1;
      v_slot := v_slot + interval '15 minutes';
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'slots_created', v_count
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_speaker_available_slots(text, date, integer, text);
CREATE OR REPLACE FUNCTION public.get_speaker_available_slots(
  p_speaker_id text,
  p_date date DEFAULT NULL,
  p_duration_minutes integer DEFAULT 15,
  p_requester_id text DEFAULT NULL
)
RETURNS TABLE (
  slot_time timestamptz,
  date date,
  start_time time,
  end_time time,
  duration_minutes integer,
  is_available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_requester_uuid uuid;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_active, false)
     OR NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN;
  END IF;

  IF p_requester_id IS NOT NULL THEN
    BEGIN
      v_requester_uuid := p_requester_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_requester_uuid := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH candidate_slots AS (
    SELECT
      ms.start_time AS slot_time,
      ms.start_time::date AS date,
      ms.start_time::time AS start_time,
      ms.end_time::time AS end_time
    FROM public.meeting_slots ms
    WHERE ms.user_id = v_speaker.user_id
      AND ms.status = 'available'
      AND (p_date IS NULL OR ms.start_time::date = p_date)
      AND ms.start_time >= now()

    UNION

    SELECT
      uas.slot_time,
      uas.slot_time::date AS date,
      uas.slot_time::time AS start_time,
      (uas.slot_time + (p_duration_minutes || ' minutes')::interval)::time AS end_time
    FROM public.user_agenda_status uas
    WHERE uas.user_id = v_speaker.user_id
      AND uas.slot_time IS NOT NULL
      AND uas.slot_status IN ('available', 'interested')
      AND (p_date IS NULL OR uas.slot_time::date = p_date)
      AND uas.slot_time >= now()
  )
  SELECT
    c.slot_time,
    c.date,
    c.start_time,
    c.end_time,
    p_duration_minutes,
    true
  FROM candidate_slots c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE m.event_id = COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025')
      AND (
        m.speaker_id = v_speaker.id
        OR m.host_id = v_speaker.user_id
        OR m.requester_id = v_speaker.user_id
      )
      AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
      AND (
        (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
        OR (c.slot_time <= m.scheduled_at AND (c.slot_time + (p_duration_minutes || ' minutes')::interval) > m.scheduled_at)
      )
  )
  AND (
    v_requester_uuid IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE m.requester_id = v_requester_uuid
        AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
        AND (
          (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
          OR (c.slot_time <= m.scheduled_at AND (c.slot_time + (p_duration_minutes || ' minutes')::interval) > m.scheduled_at)
        )
    )
  )
  ORDER BY c.slot_time;
END;
$$;

DROP FUNCTION IF EXISTS public.accept_meeting_request(text, text, timestamptz, text);
CREATE OR REPLACE FUNCTION public.accept_meeting_request(
  p_request_id text,
  p_speaker_id text,
  p_slot_start_time timestamptz,
  p_speaker_response text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
  v_meeting_id uuid := gen_random_uuid();
  v_end_time timestamptz;
  v_duration integer;
  v_slot_id uuid;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.status IN ('pending', 'requested')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  IF v_request.expires_at IS NOT NULL AND v_request.expires_at < now() THEN
    UPDATE public.meeting_requests
    SET status = 'expired', updated_at = now()
    WHERE id = p_request_id::uuid;

    RETURN jsonb_build_object('success', false, 'error', 'request_expired');
  END IF;

  v_duration := COALESCE(v_request.duration_minutes, 15);
  v_end_time := p_slot_start_time + (v_duration || ' minutes')::interval;

  INSERT INTO public.meeting_slots (user_id, start_time, end_time, status, meeting_id)
  VALUES (v_speaker.user_id, p_slot_start_time, v_end_time, 'booked', v_meeting_id)
  ON CONFLICT (user_id, start_time) DO UPDATE SET
    end_time = EXCLUDED.end_time,
    status = 'booked',
    meeting_id = v_meeting_id,
    updated_at = now()
  RETURNING id INTO v_slot_id;

  INSERT INTO public.meetings (
    id,
    meeting_request_id,
    event_id,
    slot_id,
    speaker_id,
    requester_id,
    host_id,
    attendee_id,
    speaker_name,
    requester_name,
    meeting_type,
    status,
    scheduled_at,
    start_time,
    end_time,
    duration_minutes,
    location,
    meeting_link,
    notes,
    title,
    description,
    created_at,
    updated_at
  ) VALUES (
    v_meeting_id,
    v_request.id,
    v_request.event_id,
    v_slot_id,
    v_speaker.id,
    v_request.requester_id,
    v_speaker.user_id,
    v_request.requester_id,
    COALESCE(v_request.speaker_name, v_speaker.name),
    v_request.requester_name,
    COALESCE(v_request.meeting_type, 'networking'),
    'confirmed',
    p_slot_start_time,
    p_slot_start_time,
    v_end_time,
    v_duration,
    v_request.meeting_location,
    v_request.meeting_link,
    COALESCE(p_speaker_response, 'Meeting scheduled'),
    v_request.speaker_name,
    v_request.message,
    now(),
    now()
  );

  UPDATE public.meeting_requests
  SET
    status = 'accepted',
    meeting_id = v_meeting_id,
    meeting_scheduled_at = p_slot_start_time,
    scheduled_at = p_slot_start_time,
    speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
    speaker_response_at = now(),
    updated_at = now()
  WHERE id = v_request.id;

  INSERT INTO public.user_agenda_status (
    user_id,
    agenda_id,
    event_id,
    status,
    confirmed_at,
    slot_time,
    slot_status,
    meeting_id,
    created_at,
    updated_at
  ) VALUES
  (
    v_speaker.user_id,
    v_request.id::text,
    v_request.event_id,
    'confirmed',
    now(),
    p_slot_start_time,
    'confirmed',
    v_meeting_id,
    now(),
    now()
  )
  ON CONFLICT (user_id, slot_time) DO UPDATE SET
    status = 'confirmed',
    confirmed_at = now(),
    slot_status = 'confirmed',
    meeting_id = v_meeting_id,
    updated_at = now();

  INSERT INTO public.user_agenda_status (
    user_id,
    agenda_id,
    event_id,
    status,
    confirmed_at,
    slot_time,
    slot_status,
    meeting_id,
    created_at,
    updated_at
  ) VALUES
  (
    v_request.requester_id,
    v_request.id::text,
    v_request.event_id,
    'confirmed',
    now(),
    p_slot_start_time,
    'confirmed',
    v_meeting_id,
    now(),
    now()
  )
  ON CONFLICT (user_id, slot_time) DO UPDATE SET
    status = 'confirmed',
    confirmed_at = now(),
    slot_status = 'confirmed',
    meeting_id = v_meeting_id,
    updated_at = now();

  PERFORM public.create_notification(
    v_request.requester_id,
    'meeting_accepted',
    'Meeting Request Accepted',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' accepted your meeting request.',
    v_request.id,
    v_speaker.id,
    false,
    v_meeting_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', v_meeting_id,
    'slot_id', v_slot_id,
    'start_time', p_slot_start_time,
    'end_time', v_end_time,
    'status', 'confirmed'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.decline_meeting_request(text, text, text);
CREATE OR REPLACE FUNCTION public.decline_meeting_request(
  p_request_id text,
  p_speaker_id text,
  p_speaker_response text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.status IN ('pending', 'requested', 'accepted')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  UPDATE public.meeting_requests
  SET
    status = 'declined',
    speaker_response = COALESCE(p_speaker_response, 'Meeting request declined'),
    speaker_response_at = now(),
    updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.requester_id,
    'meeting_declined',
    'Meeting Request Declined',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' declined your meeting request.',
    v_request.id,
    v_speaker.id,
    false,
    NULL
  );

  RETURN jsonb_build_object('success', true, 'status', 'declined');
END;
$$;

DROP FUNCTION IF EXISTS public.block_user_and_decline_request(text, text, text, text);
CREATE OR REPLACE FUNCTION public.block_user_and_decline_request(
  p_request_id text,
  p_speaker_id text,
  p_user_id text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.requester_id = p_user_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  INSERT INTO public.user_blocks (
    speaker_id,
    blocker_user_id,
    blocked_user_id,
    reason,
    blocked_at,
    is_muted
  ) VALUES (
    v_speaker.id,
    v_speaker.user_id,
    p_user_id::uuid,
    p_reason,
    now(),
    false
  )
  ON CONFLICT (speaker_id, blocked_user_id) DO UPDATE SET
    blocker_user_id = EXCLUDED.blocker_user_id,
    reason = COALESCE(EXCLUDED.reason, public.user_blocks.reason),
    blocked_at = now(),
    is_muted = COALESCE(EXCLUDED.is_muted, public.user_blocks.is_muted);

  UPDATE public.meeting_requests
  SET
    status = 'declined',
    speaker_response = COALESCE(p_reason, 'User blocked'),
    speaker_response_at = now(),
    updated_at = now()
  WHERE id = v_request.id;

  RETURN jsonb_build_object('success', true, 'status', 'declined', 'blocked_user_id', p_user_id);
END;
$$;

DROP FUNCTION IF EXISTS public.cancel_meeting_request(text, text);
CREATE OR REPLACE FUNCTION public.cancel_meeting_request(
  p_request_id text,
  p_user_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
BEGIN
  SELECT * INTO v_request
  FROM public.meeting_requests
  WHERE id = p_request_id::uuid
    AND requester_id = p_user_id::uuid
    AND status IN ('pending', 'requested', 'accepted')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.meeting_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = v_request.id;

  IF v_request.meeting_id IS NOT NULL THEN
    UPDATE public.meetings
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_request.meeting_id;

    UPDATE public.meeting_slots
    SET status = 'available', meeting_id = NULL, updated_at = now()
    WHERE meeting_id = v_request.meeting_id;
  END IF;

  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.expire_old_meeting_requests();
CREATE OR REPLACE FUNCTION public.expire_old_meeting_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.meeting_requests
  SET status = 'expired', updated_at = now()
  WHERE status IN ('pending', 'requested')
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;

DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text, uuid, text, boolean, uuid);
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_meeting_request_id uuid DEFAULT NULL,
  p_speaker_id text DEFAULT NULL,
  p_is_urgent boolean DEFAULT false,
  p_meeting_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    meeting_request_id,
    speaker_id,
    is_urgent,
    meeting_id
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_meeting_request_id,
    p_speaker_id,
    p_is_urgent,
    p_meeting_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.send_prioritized_notification(text, text, text, text, numeric, uuid);
CREATE OR REPLACE FUNCTION public.send_prioritized_notification(
  p_speaker_id text,
  p_requester_name text,
  p_requester_company text,
  p_ticket_type text,
  p_boost_amount numeric,
  p_meeting_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker RECORD;
  v_notification_id uuid;
  v_title text;
  v_message text;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN gen_random_uuid();
  END IF;

  v_title := CASE
    WHEN p_ticket_type = 'vip' THEN 'VIP Meeting Request'
    WHEN p_ticket_type = 'business' THEN 'Business Meeting Request'
    ELSE 'Meeting Request'
  END;

  v_message := COALESCE(p_requester_name, 'Someone') || ' wants to meet with you';
  IF COALESCE(p_requester_company, '') <> '' THEN
    v_message := v_message || ' from ' || p_requester_company;
  END IF;
  IF COALESCE(p_boost_amount, 0) > 0 THEN
    v_message := v_message || ' with a boost of ' || p_boost_amount::text;
  END IF;

  v_notification_id := public.create_notification(
    v_speaker.user_id,
    'meeting_request',
    v_title,
    v_message,
    p_meeting_request_id,
    v_speaker.id,
    true,
    NULL
  );

  RETURN v_notification_id;
END;
$$;

DROP FUNCTION IF EXISTS public.book_meeting_slot(text, text, text);
CREATE OR REPLACE FUNCTION public.book_meeting_slot(
  p_slot_id text,
  p_meeting_id text,
  p_location text DEFAULT 'Networking Area'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot RECORD;
  v_meeting RECORD;
BEGIN
  SELECT * INTO v_slot
  FROM public.meeting_slots
  WHERE id = p_slot_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  SELECT * INTO v_meeting
  FROM public.meetings
  WHERE id = p_meeting_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  UPDATE public.meeting_slots
  SET
    status = 'booked',
    meeting_id = v_meeting.id,
    updated_at = now()
  WHERE id = v_slot.id;

  UPDATE public.meetings
  SET
    slot_id = v_slot.id,
    location = COALESCE(NULLIF(p_location, ''), location),
    scheduled_at = COALESCE(scheduled_at, v_slot.start_time),
    start_time = COALESCE(start_time, v_slot.start_time),
    end_time = COALESCE(end_time, v_slot.end_time),
    status = CASE WHEN status IN ('cancelled', 'rejected') THEN status ELSE 'confirmed' END,
    updated_at = now()
  WHERE id = v_meeting.id;

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', v_meeting.id,
    'slot_id', v_slot.id,
    'start_time', v_slot.start_time,
    'end_time', v_slot.end_time,
    'location', COALESCE(NULLIF(p_location, ''), 'Networking Area')
  );
END;
$$;

DROP FUNCTION IF EXISTS public.handle_booking_status_change(text, text, text);
CREATE OR REPLACE FUNCTION public.handle_booking_status_change(
  booking_id text,
  new_status text,
  user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_normalized_status text;
  v_attendee_email text;
BEGIN
  SELECT * INTO v_booking
  FROM public.meetings
  WHERE id = booking_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF v_booking.host_id::text <> user_id AND v_booking.attendee_id::text <> user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  v_normalized_status := CASE new_status
    WHEN 'accepted' THEN 'confirmed'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'rejected' THEN 'cancelled'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE new_status
  END;

  UPDATE public.meetings
  SET status = v_normalized_status, updated_at = now()
  WHERE id = v_booking.id;

  IF v_booking.slot_id IS NOT NULL THEN
    UPDATE public.meeting_slots
    SET
      status = CASE v_normalized_status
        WHEN 'confirmed' THEN 'booked'
        WHEN 'cancelled' THEN 'available'
        ELSE status
      END,
      meeting_id = CASE WHEN v_normalized_status = 'cancelled' THEN NULL ELSE meeting_id END,
      updated_at = now()
    WHERE id = v_booking.slot_id;
  END IF;

  SELECT p.email INTO v_attendee_email
  FROM public.profiles p
  WHERE p.id = v_booking.attendee_id;

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', v_booking.id,
    'status', v_normalized_status,
    'attendee_email', v_attendee_email,
    'start_time', v_booking.start_time,
    'location', v_booking.location
  );
END;
$$;

DROP FUNCTION IF EXISTS public.update_chat_last_seen(text, text);
CREATE OR REPLACE FUNCTION public.update_chat_last_seen(
  p_user_id text,
  p_meeting_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  INSERT INTO public.chat_last_seen (user_id, meeting_id, last_seen_at)
  VALUES (p_user_id::uuid, p_meeting_id::uuid, now())
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    last_seen_at = now(),
    updated_at = now()
  RETURNING last_seen_at INTO v_seen;

  RETURN jsonb_build_object('success', true, 'last_seen_at', v_seen);
END;
$$;

DROP FUNCTION IF EXISTS public.get_chat_last_seen(text, text);
CREATE OR REPLACE FUNCTION public.get_chat_last_seen(
  p_user_id text,
  p_meeting_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  SELECT last_seen_at INTO v_seen
  FROM public.chat_last_seen
  WHERE user_id = p_user_id::uuid
    AND meeting_id = p_meeting_id::uuid
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'has_seen', v_seen IS NOT NULL,
    'last_seen_at', v_seen
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_meeting_chat_messages(text, text);
CREATE OR REPLACE FUNCTION public.get_meeting_chat_messages(
  p_meeting_id text,
  p_user_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_messages jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'meeting_id', m.meeting_id,
      'sender_id', m.sender_id,
      'message', m.message,
      'message_type', m.message_type,
      'is_read', m.is_read,
      'read_at', m.read_at,
      'created_at', m.created_at,
      'sender_type', CASE WHEN m.sender_id::text = p_user_id THEN 'you' ELSE 'speaker' END
    )
    ORDER BY m.created_at ASC
  ) INTO v_messages
  FROM public.meeting_chat_messages m
  WHERE m.meeting_id = p_meeting_id::uuid;

  RETURN jsonb_build_object(
    'success', true,
    'messages', COALESCE(v_messages, '[]'::jsonb)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.send_meeting_chat_message(text, text, text, text);
CREATE OR REPLACE FUNCTION public.send_meeting_chat_message(
  p_meeting_id text,
  p_sender_id text,
  p_message text,
  p_message_type text DEFAULT 'text'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.meeting_chat_messages (
    meeting_id,
    sender_id,
    message,
    message_type
  ) VALUES (
    p_meeting_id::uuid,
    p_sender_id::uuid,
    p_message,
    COALESCE(NULLIF(p_message_type, ''), 'text')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;

GRANT SELECT ON public.event_agenda TO anon, authenticated;
GRANT ALL ON public.event_agenda TO service_role;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
REVOKE INSERT ON public.notifications FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_requests TO authenticated;
GRANT ALL ON public.meeting_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;

GRANT SELECT, UPDATE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaker_availability TO authenticated;
GRANT SELECT ON public.speaker_availability TO anon;
GRANT ALL ON public.speaker_availability TO service_role;

GRANT SELECT, UPDATE ON public.user_request_limits TO authenticated;
GRANT ALL ON public.user_request_limits TO service_role;

GRANT SELECT ON public.boost_transactions TO authenticated;
GRANT ALL ON public.boost_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speed_dating_chats TO authenticated;
GRANT ALL ON public.speed_dating_chats TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.meeting_chat_messages TO authenticated;
GRANT ALL ON public.meeting_chat_messages TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.chat_last_seen TO authenticated;
GRANT ALL ON public.chat_last_seen TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."BSL_Bookings" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."BSL_Tickets" TO authenticated;
GRANT SELECT, INSERT ON public."BSL_Audit" TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_speaker_by_id_or_slug(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_speaker_active(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_speaker_online(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pass_type_limits(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_pass(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_meeting_request_counts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_meeting_request(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_make_meeting_request(text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_meeting_request(text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_requests_for_speaker(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_weekly_slots(text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_speaker_available_slots(text, date, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_meeting_request(text, text, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_meeting_request(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_and_decline_request(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_meeting_request(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_meeting_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_prioritized_notification(text, text, text, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_meeting_slot(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_booking_status_change(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_chat_last_seen(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_last_seen(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_chat_messages(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_meeting_chat_message(text, text, text, text) TO authenticated;

COMMIT;
