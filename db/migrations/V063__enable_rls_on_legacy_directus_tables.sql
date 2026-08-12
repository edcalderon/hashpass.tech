-- Enable Row-Level Security on the legacy directus_* tables.
--
-- These 27 tables are leftovers from the archived Directus auth provider
-- (see archive/amplify and CLAUDE.md's "Directus no longer needed" note --
-- auth now runs on Supabase OTP/email + Better Auth for Google; Directus is
-- unreachable and out of scope). They were never dropped, and on the shared
-- dev project (gsugeqozyeokncpbndna) they still had RLS disabled, which
-- Supabase's security advisor flagged as both "table publicly accessible"
-- and "sensitive data publicly accessible" (directus_users.password,
-- .tfa_secret, .token were readable via the anon/authenticated PostgREST
-- API with zero restriction).
--
-- No policies are added: these tables are dead weight, not actively used by
-- any code path, so the correct behavior is to deny all API access rather
-- than author policies for a provider that's no longer live. Enabling RLS
-- with zero policies blocks anon/authenticated access via PostgREST while
-- leaving service_role (which bypasses RLS) unaffected.

DO $$
DECLARE
  legacy_tables text[] := ARRAY[
    'directus_access',
    'directus_activity',
    'directus_collections',
    'directus_comments',
    'directus_dashboards',
    'directus_extensions',
    'directus_fields',
    'directus_files',
    'directus_flows',
    'directus_folders',
    'directus_migrations',
    'directus_notifications',
    'directus_operations',
    'directus_panels',
    'directus_permissions',
    'directus_policies',
    'directus_presets',
    'directus_relations',
    'directus_revisions',
    'directus_roles',
    'directus_sessions',
    'directus_settings',
    'directus_shares',
    'directus_translations',
    'directus_users',
    'directus_versions',
    'directus_webhooks'
  ];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY legacy_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;

INSERT INTO hashpass_schema_migrations (id, file_path)
VALUES ('V063__enable_rls_on_legacy_directus_tables', 'db/migrations/V063__enable_rls_on_legacy_directus_tables.sql')
ON CONFLICT (id) DO NOTHING;
