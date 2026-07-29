const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const migrationPath = path.join(root, 'db/migrations/V011__secure_upcoming_bsl_pass_provisioning.sql');
const meetingLifecycleMigrationPath = path.join(
  root,
  'db/migrations/V018__event_scoped_meeting_rpc_contract.sql',
);
const meetingLimitsMigrationPath = path.join(
  root,
  'db/migrations/V019__event_scoped_meeting_limits_and_duration_guard.sql',
);
const eventCatalogMigrationPath = path.join(
  root,
  'db/migrations/V020__seed_canonical_bsl_2026_event_catalog.sql',
);
const passAccessMigrationPath = path.join(
  root,
  'db/migrations/V021__repair_bsl_pass_access_and_backfill.sql',
);
const targetBslBootstrapPath = path.join(
  root,
  'packages/tools/scripts/sql/target-bsl-bootstrap.sql',
);
const profilePath = path.join(__dirname, 'config/database-profiles.json');

describe('upcoming BSL pass provisioning migration', () => {
  it('uses UUID-compatible IDs and keeps privileged minting out of public RPC access', () => {
    const migration = fs.readFileSync(migrationPath, 'utf8');

    expect(migration).toContain("v_pass_id := gen_random_uuid()::text");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_default_pass\(text, text, text\)\s+FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_default_pass\(text, text, text\)\s+TO authenticated/);
    expect(migration).toContain("auth.uid()::text <> p_user_id");
    expect(migration).toContain("p_pass_type <> 'general'");
    expect(migration).toContain('create_upcoming_bsl_general_pass_for_user');
  });

  it('ships the pass migrations through the default tenant migration command', () => {
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    expect(config.defaultGroups).toContain('upcoming-bsl-passes');
  });

  it('keeps pass access type-safe and re-backfills every confirmed user', () => {
    const migration = fs.readFileSync(passAccessMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/DROP POLICY IF EXISTS passes_select_own ON public\.passes/i);
    expect(migration).toMatch(/user_id::text\s*=\s*COALESCE\(auth\.uid\(\)::text,\s*public\.get_current_user_id\(\)::text\)/i);
    expect(migration).toContain("'chile2026'");
    expect(migration).toContain("'colombia2026'");
    expect(migration).toContain('create_upcoming_bsl_general_pass_for_user');
    expect(config.groups['upcoming-bsl-passes']).toContain(
      'db/migrations/V021__repair_bsl_pass_access_and_backfill.sql',
    );
  });
});

describe('event-scoped meeting lifecycle migration contract', () => {
  it('adds event-aware request creation and availability RPCs', () => {
    const migration = fs.readFileSync(meetingLifecycleMigrationPath, 'utf8');

    expect(migration).toMatch(/insert_meeting_request[\s\S]*p_event_id/i);
    expect(migration).toMatch(/get_speaker_available_slots[\s\S]*p_event_id/i);
    expect(migration).toMatch(/event_id[\s\S]*p_event_id/i);
  });

  it('ships all lifecycle migrations through the default tenant migration command', () => {
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.groups['meeting-lifecycle']).toEqual([
      'db/migrations/V017__harden_meeting_request_lifecycle.sql',
      'db/migrations/V018__event_scoped_meeting_rpc_contract.sql',
      'db/migrations/V019__event_scoped_meeting_limits_and_duration_guard.sql',
    ]);
  });

  it('makes meeting request counts explicitly event-scoped for PostgREST RPC calls', () => {
    const bootstrap = fs.readFileSync(targetBslBootstrapPath, 'utf8');
    const functionMatch = bootstrap.match(
      /CREATE OR REPLACE FUNCTION public\.get_user_meeting_request_counts\(([\s\S]*?)\$\$;/,
    );

    expect(functionMatch).not.toBeNull();
    expect(functionMatch[0]).toMatch(/p_event_id\s+text/i);
    expect(functionMatch[0]).not.toMatch(/current_setting\('app\.event_id'/i);
  });

  it('guards persisted meeting durations even outside the API boundary', () => {
    const migration = fs.readFileSync(meetingLimitsMigrationPath, 'utf8');

    expect(migration).toMatch(/p_event_id\s+text/i);
    expect(migration).toMatch(/duration_minutes BETWEEN 5 AND 30/i);
  });
});

describe('canonical BSL 2026 event catalog migration contract', () => {
  it('upserts complete metadata for every active 2026 tour stop', () => {
    const migration = fs.readFileSync(eventCatalogMigrationPath, 'utf8');

    for (const eventId of ['peru2026', 'chile2026', 'colombia2026']) {
      expect(migration).toContain(`'${eventId}'`);
    }
    expect(migration).toMatch(/ON CONFLICT \(id\) DO UPDATE/i);
    expect(migration).toMatch(/America\/Lima/);
    expect(migration).toMatch(/America\/Santiago/);
    expect(migration).toMatch(/America\/Bogota/);
  });

  it('ships the canonical event catalog to each tenant database profile', () => {
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('event-catalog');
    expect(config.groups['event-catalog']).toContain(
      'db/migrations/V020__seed_canonical_bsl_2026_event_catalog.sql',
    );
    expect(config.profiles['bsl-development'].databaseUrlEnv).toContain('SUPABASE_DB_URL_DEV');
  });
});
