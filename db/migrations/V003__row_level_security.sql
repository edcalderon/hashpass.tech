-- ============================================================================
-- V003: Row Level Security Policies
-- ============================================================================
-- Portable RLS policies that work with both Supabase and self-hosted.
-- Uses get_current_user_id() instead of auth.uid() for portability.
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsl_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_last_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE pass_request_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper function to check admin role
-- ============================================================================

CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
    AND role IN ('admin', 'super_admin')
    AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- ============================================================================
-- User Profiles Policies
-- ============================================================================

-- Users can view all profiles (for networking)
CREATE POLICY "profiles_select_all" ON user_profiles
  FOR SELECT
  USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own" ON user_profiles
  FOR UPDATE
  USING (user_id = get_current_user_id()::text);

-- Users can insert their own profile
CREATE POLICY "profiles_insert_own" ON user_profiles
  FOR INSERT
  WITH CHECK (user_id = get_current_user_id()::text);

-- ============================================================================
-- Passes Policies
-- ============================================================================

-- Users can view their own passes
CREATE POLICY "passes_select_own" ON passes
  FOR SELECT
  USING (user_id = get_current_user_id()::text);

-- Users can insert their own passes
CREATE POLICY "passes_insert_own" ON passes
  FOR INSERT
  WITH CHECK (user_id = get_current_user_id()::text);

-- Users can update their own passes
CREATE POLICY "passes_update_own" ON passes
  FOR UPDATE
  USING (user_id = get_current_user_id()::text);

-- Admins can manage all passes
CREATE POLICY "passes_admin_all" ON passes
  FOR ALL
  USING (is_admin(get_current_user_id()));

-- ============================================================================
-- User Roles Policies
-- ============================================================================

-- Users can view their own roles
CREATE POLICY "roles_select_own" ON user_roles
  FOR SELECT
  USING (user_id = get_current_user_id());

-- Admins can manage all roles
CREATE POLICY "roles_admin_all" ON user_roles
  FOR ALL
  USING (is_admin(get_current_user_id()));

-- ============================================================================
-- User Balances Policies
-- ============================================================================

-- Users can view their own balances
CREATE POLICY "balances_select_own" ON user_balances
  FOR SELECT
  USING (user_id = get_current_user_id());

-- System can manage balances (via service role / functions)
-- No direct user insert/update - managed by triggers

-- ============================================================================
-- User Transactions Policies
-- ============================================================================

-- Users can view their own transactions
CREATE POLICY "transactions_select_own" ON user_transactions
  FOR SELECT
  USING (user_id = get_current_user_id());

-- ============================================================================
-- BSL Speakers Policies
-- ============================================================================

-- Everyone can view active speakers
CREATE POLICY "speakers_select_active" ON bsl_speakers
  FOR SELECT
  USING (is_active = true);

-- Speakers can update their own profile (when matched)
CREATE POLICY "speakers_update_own" ON bsl_speakers
  FOR UPDATE
  USING (user_id = get_current_user_id());

-- Admins can manage all speakers
CREATE POLICY "speakers_admin_all" ON bsl_speakers
  FOR ALL
  USING (is_admin(get_current_user_id()));

-- ============================================================================
-- Meeting Requests Policies
-- ============================================================================

-- Users can view requests they sent or received
CREATE POLICY "requests_select_participant" ON meeting_requests
  FOR SELECT
  USING (
    requester_id = get_current_user_id()
    OR speaker_id IN (
      SELECT id FROM bsl_speakers WHERE user_id = get_current_user_id()
    )
  );

-- Users can insert their own requests
CREATE POLICY "requests_insert_own" ON meeting_requests
  FOR INSERT
  WITH CHECK (requester_id = get_current_user_id());

-- Requesters can update their pending requests (cancel)
CREATE POLICY "requests_update_requester" ON meeting_requests
  FOR UPDATE
  USING (requester_id = get_current_user_id() AND status = 'pending');

-- Speakers can update requests they received
CREATE POLICY "requests_update_speaker" ON meeting_requests
  FOR UPDATE
  USING (
    speaker_id IN (
      SELECT id FROM bsl_speakers WHERE user_id = get_current_user_id()
    )
  );

-- ============================================================================
-- User Blocks Policies
-- ============================================================================

-- Users can view their own blocks
CREATE POLICY "blocks_select_own" ON user_blocks
  FOR SELECT
  USING (blocker_id = get_current_user_id());

-- Users can create blocks
CREATE POLICY "blocks_insert_own" ON user_blocks
  FOR INSERT
  WITH CHECK (blocker_id = get_current_user_id());

-- Users can remove their own blocks
CREATE POLICY "blocks_delete_own" ON user_blocks
  FOR DELETE
  USING (blocker_id = get_current_user_id());

-- ============================================================================
-- Meetings Policies
-- ============================================================================

-- Participants can view their meetings
CREATE POLICY "meetings_select_participant" ON meetings
  FOR SELECT
  USING (
    requester_id = get_current_user_id()
    OR speaker_id IN (
      SELECT id FROM bsl_speakers WHERE user_id = get_current_user_id()
    )
  );

-- Participants can update their meetings
CREATE POLICY "meetings_update_participant" ON meetings
  FOR UPDATE
  USING (
    requester_id = get_current_user_id()
    OR speaker_id IN (
      SELECT id FROM bsl_speakers WHERE user_id = get_current_user_id()
    )
  );

-- ============================================================================
-- Chat Messages Policies
-- ============================================================================

-- Participants can view messages in their meeting requests
CREATE POLICY "chat_select_participant" ON meeting_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM meeting_requests mr
      WHERE mr.id = meeting_request_id
      AND (
        mr.requester_id = get_current_user_id()
        OR mr.speaker_id IN (
          SELECT id FROM bsl_speakers WHERE user_id = get_current_user_id()
        )
      )
    )
  );

-- Participants can send messages
CREATE POLICY "chat_insert_participant" ON meeting_chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = get_current_user_id()
    AND EXISTS (
      SELECT 1 FROM meeting_requests mr
      WHERE mr.id = meeting_request_id
      AND (
        mr.requester_id = get_current_user_id()
        OR mr.speaker_id IN (
          SELECT id FROM bsl_speakers WHERE user_id = get_current_user_id()
        )
      )
    )
  );

-- ============================================================================
-- Chat Last Seen Policies
-- ============================================================================

CREATE POLICY "chat_last_seen_select_own" ON chat_last_seen
  FOR SELECT
  USING (user_id = get_current_user_id());

CREATE POLICY "chat_last_seen_upsert_own" ON chat_last_seen
  FOR INSERT
  WITH CHECK (user_id = get_current_user_id());

CREATE POLICY "chat_last_seen_update_own" ON chat_last_seen
  FOR UPDATE
  USING (user_id = get_current_user_id());

-- ============================================================================
-- Pass Request Limits Policies
-- ============================================================================

CREATE POLICY "limits_select_own" ON pass_request_limits
  FOR SELECT
  USING (user_id = get_current_user_id()::text);

CREATE POLICY "limits_update_own" ON pass_request_limits
  FOR UPDATE
  USING (user_id = get_current_user_id()::text);

-- ============================================================================
-- Email Sent Log Policies
-- ============================================================================

CREATE POLICY "email_log_select_own" ON email_sent_log
  FOR SELECT
  USING (user_id = get_current_user_id());
