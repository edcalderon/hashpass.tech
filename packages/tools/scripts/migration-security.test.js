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
const agendaTypesMigrationPath = path.join(
  root,
  'db/migrations/V024__expand_event_agenda_types.sql',
);
const meetingIdentityMigrationPath = path.join(
  root,
  'db/migrations/V025__fix_meeting_identity_type_casts.sql',
);
const speakerIdentityMigrationPath = path.join(
  root,
  'db/migrations/V026__fix_speaker_identity_type_casts.sql',
);
const speakerSlugMigrationPath = path.join(
  root,
  'db/migrations/V027__support_speaker_slugs_in_meeting_rpc.sql',
);
const speakerIdentityClaimsMigrationPath = path.join(
  root,
  'db/migrations/V028__claim_speaker_profiles_on_verified_signup.sql',
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
      'db/migrations/V025__fix_meeting_identity_type_casts.sql',
      'db/migrations/V026__fix_speaker_identity_type_casts.sql',
      'db/migrations/V027__support_speaker_slugs_in_meeting_rpc.sql',
    ]);
  });

  it('casts UUID pass owners before comparing text RPC parameters', () => {
    const migration = fs.readFileSync(meetingIdentityMigrationPath, 'utf8');
    const speakerMigration = fs.readFileSync(speakerIdentityMigrationPath, 'utf8');

    expect(migration).toMatch(/p\.user_id::text\s*=\s*p_user_id/);
    expect(migration).toMatch(/user_id::text\s*=\s*p_user_id/);
    expect(speakerMigration).toMatch(/s\.id::text\s*=\s*p_id/);
    expect(speakerMigration).toMatch(/ub\.speaker_id::text\s*=\s*v_speaker\.id/);
    expect(fs.readFileSync(speakerSlugMigrationPath, 'utf8')).toMatch(/to_jsonb\(s\)->>'slug'/);
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

  it('ships the agenda type constraint migration through the default tenant migration command', () => {
    const migration = fs.readFileSync(agendaTypesMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/registration/);
    expect(migration).toMatch(/meal/);
    expect(config.defaultGroups).toContain('event-catalog');
    expect(config.groups['event-catalog']).toContain(
      'db/migrations/V024__expand_event_agenda_types.sql',
    );
  });
});

describe('verified speaker identity claim migration contract', () => {
  it('claims a preconfigured speaker only after verified signup and applies only preapproved event roles', () => {
    const migration = fs.existsSync(speakerIdentityClaimsMigrationPath)
      ? fs.readFileSync(speakerIdentityClaimsMigrationPath, 'utf8')
      : '';
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.speaker_identity_claims/i);
    expect(migration).toMatch(/email_confirmed_at IS NULL AND NEW\.confirmed_at IS NULL/i);
    expect(migration).toMatch(/UPDATE public\.bsl_speakers[\s\S]*SET user_id = p_user_id/i);
    expect(migration).toMatch(/INSERT INTO public\.event_roles[\s\S]*ON CONFLICT \(event_id, user_id, role\) DO NOTHING/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.configure_speaker_identity_claim/i);
    expect(migration).toMatch(/Only a super admin may preconfigure event_admin/i);
    expect(migration).toMatch(/CREATE TRIGGER trg_claim_speaker_profile_on_verified_signup/i);
    expect(config.defaultGroups).toContain('speaker-identity-claims');
    expect(config.groups['speaker-identity-claims']).toContain(
      'db/migrations/V028__claim_speaker_profiles_on_verified_signup.sql',
    );
  });
});
