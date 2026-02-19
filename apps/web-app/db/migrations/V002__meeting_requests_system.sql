-- ============================================================================
-- V002: Meeting Requests System
-- ============================================================================
-- Creates the meeting request (matchmaking) system for networking.
-- This is the core feature for BSL 2025.
-- ============================================================================

-- ============================================================================
-- BSL Speakers Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS bsl_speakers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid, -- Links to auth user when matched
  name text NOT NULL,
  slug text UNIQUE,
  title text,
  company text,
  bio text,
  image_url text,
  linkedin_url text,
  twitter_url text,
  website_url text,
  
  -- Schedule
  day text, -- 'Day 1', 'Day 2', 'Day 3'
  day_name text,
  session_time text,
  session_title text,
  session_type text, -- 'keynote', 'panel', 'workshop'
  
  -- Status
  is_active boolean DEFAULT true,
  is_accepting_meetings boolean DEFAULT true,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_bsl_speakers_user_id ON bsl_speakers(user_id);
CREATE INDEX idx_bsl_speakers_slug ON bsl_speakers(slug);
CREATE INDEX idx_bsl_speakers_day ON bsl_speakers(day);
CREATE INDEX idx_bsl_speakers_active ON bsl_speakers(is_active) WHERE is_active = true;

-- ============================================================================
-- Meeting Requests Table
-- ============================================================================

CREATE TYPE meeting_request_status AS ENUM (
  'pending', 'accepted', 'declined', 'expired', 'cancelled', 'completed'
);

CREATE TABLE IF NOT EXISTS meeting_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id uuid NOT NULL, -- User who made the request
  speaker_id uuid NOT NULL REFERENCES bsl_speakers(id),
  
  -- Request details
  message text,
  note text,
  meeting_type text DEFAULT 'networking',
  
  -- Status tracking
  status meeting_request_status DEFAULT 'pending',
  
  -- Scheduling
  scheduled_at timestamptz,
  duration_minutes integer DEFAULT 15,
  location text,
  meeting_link text,
  
  -- Boost system (spend tokens to boost visibility)
  boost_amount decimal(20,8) DEFAULT 0,
  
  -- Response tracking
  speaker_response text,
  speaker_response_at timestamptz,
  
  -- Expiration
  expires_at timestamptz DEFAULT (now() + interval '48 hours'),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate requests
  CONSTRAINT unique_pending_request UNIQUE (requester_id, speaker_id, status)
    WHERE status = 'pending'
);

CREATE INDEX idx_meeting_requests_requester ON meeting_requests(requester_id);
CREATE INDEX idx_meeting_requests_speaker ON meeting_requests(speaker_id);
CREATE INDEX idx_meeting_requests_status ON meeting_requests(status);
CREATE INDEX idx_meeting_requests_expires ON meeting_requests(expires_at) WHERE status = 'pending';

-- ============================================================================
-- User Blocks Table (for blocking users)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  blocker_id uuid NOT NULL, -- User who blocked
  blocked_id uuid NOT NULL, -- User who was blocked
  reason text,
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_id);

-- ============================================================================
-- Meetings Table (confirmed meetings)
-- ============================================================================

CREATE TYPE meeting_status AS ENUM (
  'scheduled', 'confirmed', 'tentative', 'in_progress', 
  'completed', 'cancelled', 'no_show'
);

CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_request_id uuid REFERENCES meeting_requests(id),
  speaker_id uuid NOT NULL REFERENCES bsl_speakers(id),
  requester_id uuid NOT NULL,
  
  -- Participants
  speaker_name text,
  requester_name text,
  
  -- Meeting details
  meeting_type text DEFAULT 'networking',
  status meeting_status DEFAULT 'scheduled',
  
  -- Schedule
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 15,
  
  -- Location
  location text,
  meeting_link text,
  
  -- Notes
  notes text,
  title text,
  description text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_meetings_speaker ON meetings(speaker_id);
CREATE INDEX idx_meetings_requester ON meetings(requester_id);
CREATE INDEX idx_meetings_scheduled ON meetings(scheduled_at);
CREATE INDEX idx_meetings_status ON meetings(status);

-- ============================================================================
-- Chat Messages Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS meeting_chat_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_request_id uuid NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_messages_request ON meeting_chat_messages(meeting_request_id);
CREATE INDEX idx_chat_messages_sender ON meeting_chat_messages(sender_id);
CREATE INDEX idx_chat_messages_created ON meeting_chat_messages(created_at);

-- Chat last seen tracking
CREATE TABLE IF NOT EXISTS chat_last_seen (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_request_id uuid NOT NULL REFERENCES meeting_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_seen_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_chat_last_seen UNIQUE (meeting_request_id, user_id)
);

-- ============================================================================
-- Pass Request Limits Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS pass_request_limits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text NOT NULL,
  pass_id uuid REFERENCES passes(id),
  max_requests integer DEFAULT 5,
  requests_used integer DEFAULT 0,
  reset_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_user_limits UNIQUE (user_id)
);

CREATE INDEX idx_pass_limits_user ON pass_request_limits(user_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check if a user can make a meeting request
CREATE OR REPLACE FUNCTION can_make_meeting_request(
  p_requester_id uuid,
  p_speaker_id uuid,
  p_boost_amount decimal DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_pass passes%ROWTYPE;
  v_speaker bsl_speakers%ROWTYPE;
  v_is_blocked boolean;
  v_existing_request meeting_requests%ROWTYPE;
  v_requests_today integer;
BEGIN
  -- Get requester's pass
  SELECT * INTO v_pass FROM passes
  WHERE user_id = p_requester_id::text
  AND event_id = 'bsl2025'
  AND is_active = true
  LIMIT 1;
  
  IF v_pass.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'no_valid_pass',
      'message', 'You need a valid pass to send meeting requests'
    );
  END IF;
  
  -- Check remaining requests
  IF v_pass.requests_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'no_requests_remaining',
      'message', 'You have used all your meeting requests',
      'requests_sent', v_pass.requests_sent,
      'max_allowed', v_pass.max_requests_allowed
    );
  END IF;
  
  -- Get speaker
  SELECT * INTO v_speaker FROM bsl_speakers
  WHERE id = p_speaker_id AND is_active = true;
  
  IF v_speaker.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'speaker_not_found',
      'message', 'Speaker not found or not available'
    );
  END IF;
  
  -- Check if speaker is accepting meetings
  IF NOT v_speaker.is_accepting_meetings THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'not_accepting_meetings',
      'message', 'This speaker is not accepting meeting requests'
    );
  END IF;
  
  -- Check if blocked
  SELECT EXISTS (
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = p_speaker_id AND blocked_id = p_requester_id)
       OR (blocker_id = p_requester_id AND blocked_id = p_speaker_id)
  ) INTO v_is_blocked;
  
  IF v_is_blocked THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'blocked',
      'message', 'Cannot send request to this speaker'
    );
  END IF;
  
  -- Check for existing pending request
  SELECT * INTO v_existing_request FROM meeting_requests
  WHERE requester_id = p_requester_id
    AND speaker_id = p_speaker_id
    AND status = 'pending';
  
  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'existing_pending_request',
      'message', 'You already have a pending request to this speaker'
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'can_request', true,
    'requests_remaining', v_pass.requests_remaining - 1,
    'speaker_name', v_speaker.name
  );
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER trg_bsl_speakers_updated_at
  BEFORE UPDATE ON bsl_speakers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_meeting_requests_updated_at
  BEFORE UPDATE ON meeting_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
