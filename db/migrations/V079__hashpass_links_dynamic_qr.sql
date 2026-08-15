-- HashPass Links: centralized dynamic QR, privacy-conscious analytics, audit,
-- and QR auth. owner_id/actor_id/approved_by_user_id FK auth.users(id)
-- directly, matching current convention for new tables (see V071, V074) --
-- safe now that every sign-in path (Better Auth, Directus, native) is
-- bridged to a real auth.users row.

CREATE TYPE qr_link_status AS ENUM ('active', 'paused', 'expired', 'archived');
CREATE TYPE qr_auth_status AS ENUM ('pending', 'approved', 'denied', 'expired', 'consumed', 'cancelled');

CREATE TABLE qr_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  public_slug text NOT NULL UNIQUE CHECK (public_slug ~ '^[A-Za-z0-9_-]{8,32}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description text CHECK (char_length(description) <= 1000),
  destination_url text NOT NULL,
  campaign_source text,
  campaign_medium text,
  campaign_name text,
  campaign_term text,
  campaign_content text,
  visual_config jsonb NOT NULL DEFAULT '{"foreground":"#071426","background":"#ffffff","modules":"square","finderEye":"rounded","logo":false,"errorCorrection":"Q","margin":4,"logoSize":18}',
  status qr_link_status NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qr_links_owner_updated_idx ON qr_links(owner_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE qr_scan_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_link_id uuid NOT NULL REFERENCES qr_links(id) ON DELETE CASCADE,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  visitor_hash text NOT NULL,
  country text,
  city text,
  device_type text NOT NULL DEFAULT 'unknown',
  os text,
  browser text,
  referrer text,
  bot_classification text NOT NULL DEFAULT 'unknown',
  campaign jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX qr_scans_link_time_idx ON qr_scan_events(qr_link_id, scanned_at DESC);

CREATE TABLE qr_link_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  qr_link_id uuid NOT NULL REFERENCES qr_links(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- authorization_code_secret is deliberately stored (not just its hash): the
-- browser polling GET /api/v1/auth/qr/challenges/:id needs to receive the
-- raw one-time code once approved (it has no other way to learn it -- the
-- native app generated it), so it's read back from here on that one poll
-- response and cleared immediately on consumption in POST .../exchange.
CREATE TABLE qr_auth_challenges (
  id text PRIMARY KEY CHECK (char_length(id) >= 32),
  browser_binding_hash text NOT NULL,
  state_hash text NOT NULL,
  code_challenge text NOT NULL,
  status qr_auth_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  approved_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  authorization_code_hash text,
  authorization_code_secret text,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= created_at + interval '5 minutes')
);
CREATE INDEX qr_auth_expiry_idx ON qr_auth_challenges(expires_at) WHERE status = 'pending';

CREATE TABLE qr_auth_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenge_id text NOT NULL REFERENCES qr_auth_challenges(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qr_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_link_audit_events ENABLE ROW LEVEL SECURITY;
-- qr_auth_challenges/qr_auth_events intentionally get RLS enabled with no
-- policies: with zero policies, RLS denies all access to any non-service-
-- role caller, so these are only ever reachable through the API's
-- service-role client -- never directly by an authenticated end user, even
-- their own challenge. That's the point: a challenge's browser-binding and
-- state secrets must never be queryable except through the exact
-- server-side checks in the auth-qr routes.
ALTER TABLE qr_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_auth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY qr_links_owner_all ON qr_links FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY qr_scans_owner_read ON qr_scan_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM qr_links q WHERE q.id = qr_link_id AND q.owner_id = auth.uid())
);
CREATE POLICY qr_audit_owner_read ON qr_link_audit_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM qr_links q WHERE q.id = qr_link_id AND q.owner_id = auth.uid())
);

CREATE OR REPLACE FUNCTION touch_qr_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;
CREATE TRIGGER qr_link_updated BEFORE UPDATE ON qr_links FOR EACH ROW EXECUTE FUNCTION touch_qr_link();
