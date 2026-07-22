-- V008: Enable Row-Level Security on every public-schema table that was
-- missing it.
--
-- Found via Supabase security advisors on the dev project (fxgftanraszjjyeidvia):
--   - rls_disabled_in_public: "Anyone with your project URL can read, edit,
--     and delete all data in this table because Row-Level Security is not
--     enabled."
--   - sensitive_columns_exposed: a table with columns that likely contain
--     sensitive data (passwords, tokens, personal identifiers) is accessible
--     through the API without any access restrictions.
--
-- Confirmed live (2026-07-22) via direct psql connection: 33 public tables had
-- relrowsecurity = false. Two categories:
--
-- 1. Better Auth's own tables (account, ba_users, session, verification).
--    `account` has accessToken/refreshToken/idToken/password columns, and
--    `session` has a live `token` column — both were fully readable via
--    PostgREST with just the anon key (Supabase auto-exposes every
--    public-schema table unless RLS blocks it). This is the exact match for
--    "sensitive_columns_exposed": a public anon-key request against
--    /rest/v1/account or /rest/v1/session would return every user's live
--    OAuth tokens, session tokens, and password hashes.
--
-- 2. 27 directus_* system tables (directus_users, directus_sessions,
--    directus_permissions, directus_roles, etc.) — Directus's own internal
--    tables, equally exposed via the same PostgREST path. Directus is
--    documented as no longer used for auth (unreachable, kept around but
--    inactive — see apps/docs), so these get RLS enabled with zero
--    permissive policies: a full default-deny for anon/authenticated roles.
--
-- Plus meeting_slots and qr_scan_logs, which are missing RLS but are never
-- queried directly by the client (grepped the app for `.from('meeting_slots')`
-- / `.from('qr_scan_logs')` — zero call sites); all real access goes through
-- server-side API routes on the service-role key. qr_scan_logs already has a
-- correctly-scoped policy from an earlier migration
-- ("Users can view their QR scan logs") that was inert this whole time
-- because RLS itself was never turned on for the table — this migration
-- activates it, it does not need to be recreated.
--
-- Why enabling RLS here is safe for every legitimate access path:
-- Both Better Auth (apps/mobile-app/lib/server/database-pool.ts, a raw pg.Pool
-- using SUPABASE_DB_URL/DATABASE_URL) and any server-side Supabase client
-- using the service_role key connect as roles with BYPASSRLS (the `postgres`
-- role, and Supabase's service_role, are both RLS-exempt by design). Only
-- PostgREST's `anon`/`authenticated` roles — i.e. any request using just the
-- publishable/anon key, which is the public-facing exposure these advisories
-- flag — are affected by enabling RLS here. No default-deny policy is added
-- for account/ba_users/session/verification/directus_*/meeting_slots because
-- nothing in this app is meant to reach them through the public REST API at
-- all; a "no policies + RLS enabled" table is a hard, correct block for that
-- entire path, not a gap to fill in with a permissive policy later.

DO $$
DECLARE
  directus_table text;
BEGIN
  FOR directus_table IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'directus\_%'
      AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', directus_table);
  END LOOP;
END $$;

-- Existence-guarded: core/dev and core/production schemas have documented
-- drift (see apps/docs "DB migration debt"), so not every table below is
-- guaranteed to exist in every environment this migration runs against
-- (confirmed live: qr_scan_logs exists on dev but not on production).
-- hashpass_schema_migrations is included here too: the tracked migration
-- runner (packages/tools/scripts/migrate-tenant-db.mjs) creates it with a
-- bare CREATE TABLE IF NOT EXISTS that does not itself enable RLS, so a fresh
-- environment running this migration for the first time would otherwise
-- leave its own migration-tracking table as the one gap.
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'account', 'ba_users', 'session', 'verification',
    'meeting_slots', 'qr_scan_logs', 'hashpass_schema_migrations'
  ]
  LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', target_table);
    END IF;
  END LOOP;
END $$;
