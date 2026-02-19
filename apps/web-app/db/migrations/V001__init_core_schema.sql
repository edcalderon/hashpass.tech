-- ============================================================================
-- V001: Initialize Core Schema
-- ============================================================================
-- This migration creates the base schema that is portable across providers.
-- It does NOT include auth-specific tables (handled by Supabase/Directus).
-- 
-- Tables created:
--   - user_profiles: Extended user data
--   - passes: Event passes/tickets
--   - user_roles: Role assignments
--   - user_balances: Token balances (LUKAS rewards)
--   - user_transactions: Transaction history
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Helper Functions for Multi-tenant Context
-- ============================================================================

-- Get current user ID from session context
-- This replaces Supabase's auth.uid()
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;

-- Get current tenant ID from session context
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

-- Set session context (called from API layer)
CREATE OR REPLACE FUNCTION set_session_context(
  p_user_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.user_id', p_user_id::text, true);
  END IF;
  IF p_tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  END IF;
END;
$$;

-- ============================================================================
-- User Profiles Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text UNIQUE NOT NULL, -- Links to auth provider's user ID
  full_name text,
  display_name text,
  avatar_url text,
  company text,
  title text,
  bio text,
  wallet_address text,
  email text,
  phone text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_wallet ON user_profiles(wallet_address);

-- ============================================================================
-- Passes Table (Event Tickets)
-- ============================================================================

CREATE TYPE pass_tier AS ENUM ('free', 'general', 'speaker', 'vip', 'platinum', 'enterprise');

CREATE TABLE IF NOT EXISTS passes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id text NOT NULL,
  pass_number serial,
  tier pass_tier DEFAULT 'free',
  event_id text DEFAULT 'bsl2025',
  name text,
  email text,
  company text,
  title text,
  
  -- Request limits (updated by triggers)
  max_requests_allowed integer DEFAULT 5,
  requests_remaining integer DEFAULT 5,
  requests_sent integer DEFAULT 0,
  request_limit_percentage decimal(5,2) DEFAULT 100.00,
  
  -- Metadata
  metadata jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_user_event UNIQUE (user_id, event_id)
);

CREATE INDEX idx_passes_user_id ON passes(user_id);
CREATE INDEX idx_passes_event_id ON passes(event_id);
CREATE INDEX idx_passes_tier ON passes(tier);

-- ============================================================================
-- User Roles Table
-- ============================================================================

CREATE TYPE user_role AS ENUM ('user', 'speaker', 'organizer', 'admin', 'super_admin');

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL, -- This references auth user ID
  role user_role DEFAULT 'user',
  granted_by uuid,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}',
  
  CONSTRAINT unique_user_role UNIQUE (user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- ============================================================================
-- User Balances Table (Token System)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_balances (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  token_symbol text NOT NULL DEFAULT 'LUKAS',
  balance decimal(20,8) DEFAULT 0,
  total_earned decimal(20,8) DEFAULT 0,
  total_spent decimal(20,8) DEFAULT 0,
  last_transaction_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_user_token UNIQUE (user_id, token_symbol),
  CONSTRAINT positive_balance CHECK (balance >= 0)
);

CREATE INDEX idx_user_balances_user_token ON user_balances(user_id, token_symbol);

-- ============================================================================
-- User Transactions Table
-- ============================================================================

CREATE TYPE transaction_type AS ENUM (
  'reward', 'spend', 'transfer_in', 'transfer_out', 
  'boost', 'refund', 'admin_adjustment'
);

CREATE TABLE IF NOT EXISTS user_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  token_symbol text NOT NULL DEFAULT 'LUKAS',
  transaction_type transaction_type NOT NULL,
  amount decimal(20,8) NOT NULL,
  balance_after decimal(20,8),
  description text,
  reference_type text, -- e.g., 'meeting_request', 'meeting_accepted'
  reference_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON user_transactions(user_id);
CREATE INDEX idx_transactions_type ON user_transactions(transaction_type);
CREATE INDEX idx_transactions_created ON user_transactions(created_at);

-- ============================================================================
-- Email Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_sent_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  email_type text NOT NULL,
  recipient_email text,
  metadata jsonb DEFAULT '{}',
  sent_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_user_email_type UNIQUE (user_id, email_type)
);

CREATE INDEX idx_email_log_user_id ON email_sent_log(user_id);
CREATE INDEX idx_email_log_type ON email_sent_log(email_type);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check if an email has been sent to a user
CREATE OR REPLACE FUNCTION has_email_been_sent(
  p_user_id uuid,
  p_email_type text
)
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM email_sent_log
    WHERE user_id = p_user_id AND email_type = p_email_type
  );
END;
$$;

-- Mark an email as sent
CREATE OR REPLACE FUNCTION mark_email_as_sent(
  p_user_id uuid,
  p_email_type text,
  p_recipient_email text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO email_sent_log (user_id, email_type, recipient_email, metadata)
  VALUES (p_user_id, p_email_type, p_recipient_email, p_metadata)
  ON CONFLICT (user_id, email_type) DO NOTHING;
END;
$$;

-- ============================================================================
-- Timestamp Update Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply to tables with updated_at
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_passes_updated_at
  BEFORE UPDATE ON passes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_balances_updated_at
  BEFORE UPDATE ON user_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
