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
const speakerIdentityClaimsFollowUpMigrationPath = path.join(
  root,
  'db/migrations/V029__harden_speaker_identity_claims.sql',
);
const passClaimCodeMigrationPath = path.join(
  root,
  'db/migrations/V030__add_secure_pass_claim_codes.sql',
);
const eventPassTierDefaultIssuanceMigrationPath = path.join(
  root,
  'db/migrations/V037__apply_event_tiers_to_default_passes.sql',
);
const meetingPassConsumptionMigrationPath = path.join(
  root,
  'db/migrations/V038__consume_pass_entitlements_for_meeting_requests.sql',
);
const passNumberBackfillMigrationPath = path.join(
  root,
  'db/migrations/V039__backfill_missing_pass_numbers.sql',
);
const eventAdminScopeAndSlotMigrationPath = path.join(
  root,
  'db/migrations/V040__fix_event_admin_scope_and_slot_overloads.sql',
);
const adminPassAndUserListingMigrationPath = path.join(
  root,
  'db/migrations/V041__admin_pass_and_user_listing.sql',
);
const meetingChatRealtimeMigrationPath = path.join(
  root,
  'db/migrations/V054__meeting_chat_realtime_and_participant_profiles.sql',
);
const legacyDirectusRlsMigrationPath = path.join(
  root,
  'db/migrations/V063__enable_rls_on_legacy_directus_tables.sql',
);
const deadTableCleanupMigrationPath = path.join(
  root,
  'db/migrations/V064__drop_dead_matchmaking_and_orphaned_tables.sql',
);
const meetingChatPolicyRepairMigrationPath = path.join(
  root,
  'db/migrations/V066__restore_meeting_chat_messages_policies.sql',
);
const adminMatchmakingAndEmailAuditMigrationPath = path.join(
  root,
  'db/migrations/V055__admin_matchmaking_and_email_audit.sql',
);
const adminEmailDeliveryTemplateMigrationPath = path.join(
  root,
  'db/migrations/V056__admin_email_delivery_template.sql',
);
const adminEventScopedAttendeesMigrationPath = path.join(
  root,
  'db/migrations/V057__admin_event_scoped_attendees.sql',
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

  it('uses configured event tiers for trigger and self-service default passes', () => {
    const migration = fs.readFileSync(eventPassTierDefaultIssuanceMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.create_upcoming_bsl_general_pass_for_user/i);
    expect(migration).toMatch(/FROM public\.event_pass_tiers[\s\S]*event_id = p_event_id[\s\S]*pass_type = 'general'/i);
    expect(migration).toMatch(/v_tier\.max_meeting_requests/i);
    expect(migration).toMatch(/v_tier\.max_boost_amount/i);
    expect(migration).not.toMatch(/get_pass_type_limits/i);
    expect(config.groups['event-pass-tiers']).toContain(
      'db/migrations/V037__apply_event_tiers_to_default_passes.sql',
    );
  });

  it('backfills legacy blank pass numbers through the default tenant migration plan', () => {
    const migration = fs.readFileSync(passNumberBackfillMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/UPDATE public\.passes/i);
    expect(migration).toMatch(/NULLIF\(btrim\(COALESCE\(pass_number, ''\)\), ''\) IS NULL/i);
    expect(migration).toMatch(/BSL-' \|\| upper\(COALESCE\(pass_type::text, 'general'\)\)/i);
    expect(config.groups['event-pass-tiers']).toContain(
      'db/migrations/V039__backfill_missing_pass_numbers.sql',
    );
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

describe('admin pass management migration contract', () => {
  it('ships the admin RPCs through the default tenant migration command with compatible numeric fields and all pass statuses', () => {
    const migration = fs.readFileSync(adminPassAndUserListingMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('admin-pass-management');
    expect(config.groups['admin-pass-management']).toContain(
      'db/migrations/V041__admin_pass_and_user_listing.sql',
    );
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_list_event_passes/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_search_active_users/i);
    expect(migration).toMatch(/max_boost_amount numeric, used_boost_amount numeric/i);
    expect(migration).toMatch(/p\.max_boost_amount::numeric, p\.used_boost_amount::numeric/i);
    expect(migration).not.toMatch(/WHERE p\.event_id = p_event_id AND p\.status/i);
  });
});

describe('admin matchmaking and email campaign migration contract', () => {
  it('ships the audit tables, template column, and event-scoped attendee resolver through the default tenant migration command', () => {
    const auditMigration = fs.readFileSync(adminMatchmakingAndEmailAuditMigrationPath, 'utf8');
    const templateMigration = fs.readFileSync(adminEmailDeliveryTemplateMigrationPath, 'utf8');
    const attendeesMigration = fs.readFileSync(adminEventScopedAttendeesMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('admin-matchmaking-communications');
    expect(config.groups['admin-matchmaking-communications']).toEqual([
      'db/migrations/V055__admin_matchmaking_and_email_audit.sql',
      'db/migrations/V056__admin_email_delivery_template.sql',
      'db/migrations/V057__admin_event_scoped_attendees.sql',
    ]);

    expect(auditMigration).toMatch(/CREATE TABLE IF NOT EXISTS public\.admin_email_deliveries/i);
    expect(auditMigration).toMatch(/CREATE TABLE IF NOT EXISTS public\.admin_matchmaking_runs/i);
    expect(templateMigration).toMatch(/ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'branded'/i);

    // Resolves attendees through the passes table (real event membership),
    // not a platform-wide user search — see admin_search_active_users above,
    // which intentionally stays unscoped for its other (global search) callers.
    expect(attendeesMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_list_event_attendees/i);
    expect(attendeesMigration).toMatch(/FROM public\.passes p\s*\n\s*WHERE p\.event_id = p_event_id/i);
    expect(attendeesMigration).toMatch(/has_event_admin_access/i);
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
      'db/migrations/V032__align_meeting_request_foreign_keys_with_auth.sql',
      'db/migrations/V034__align_notifications_with_auth_identities.sql',
      'db/migrations/V038__consume_pass_entitlements_for_meeting_requests.sql',
      'db/migrations/V040__fix_event_admin_scope_and_slot_overloads.sql',
      'db/migrations/V043__meeting_slot_conflict_resolution.sql',
      'db/migrations/V044__default_free_speaker_slots.sql',
      'db/migrations/V045__drop_stale_meeting_lifecycle_overloads.sql',
      'db/migrations/V046__fix_meeting_identity_fk_targets.sql',
      'db/migrations/V047__fix_agenda_status_confirmed_value.sql',
      'db/migrations/V048__fix_speaker_id_type_comparison.sql',
      'db/migrations/V049__drop_dead_accepted_status_literal.sql',
      'db/migrations/V050__resolve_agenda_status_registry_id.sql',
      'db/migrations/V051__fix_meetings_speaker_id_write_type_divergence.sql',
      'db/migrations/V052__notification_levels_and_critical_delivery.sql',
    ]);
  });

  it('keeps BSL hub administrators authorized for their tour events and exposes one slot RPC signature', () => {
    const migration = fs.readFileSync(eventAdminScopeAndSlotMigrationPath, 'utf8');

    expect(migration).toMatch(/metadata\s*->>\s*'hubEventId'/i);
    expect(migration).toMatch(/DROP FUNCTION IF EXISTS public\.get_speaker_available_slots\(text, date, integer\)/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_speaker_available_slots\([\s\S]*p_event_id text DEFAULT NULL/i);
  });

  it('consumes the event pass when a meeting request is sent', () => {
    const migration = fs.readFileSync(meetingPassConsumptionMigrationPath, 'utf8');

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.insert_meeting_request/i);
    expect(migration).toMatch(/p\.event_id = v_event_id/i);
    expect(migration).toMatch(/used_meeting_requests = COALESCE\(p\.used_meeting_requests, 0\) \+ 1/i);
    expect(migration).toMatch(/used_boost_amount = COALESCE\(p\.used_boost_amount, 0\)/i);
    expect(migration).toMatch(/v_pass\.max_meeting_requests, 0\) - COALESCE\(v_pass\.used_meeting_requests, 0\)/i);
    expect(migration).not.toMatch(/status NOT IN \('cancelled', 'expired'\)/i);
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

describe('encrypted meeting chat realtime contract', () => {
  it('publishes chat messages and provides participants’ public profile avatars', () => {
    const migration = fs.readFileSync(meetingChatRealtimeMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('meeting-chat-e2e');
    expect(config.groups['meeting-chat-e2e']).toContain(
      'db/migrations/V054__meeting_chat_realtime_and_participant_profiles.sql',
    );
    expect(config.groups['meeting-chat-e2e']).toContain(
      'db/migrations/V066__restore_meeting_chat_messages_policies.sql',
    );
    expect(migration).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.meeting_chat_messages/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.get_meeting_chat_participant/i);
    expect(migration).toMatch(/profile\.avatar_url/i);
    expect(migration).toMatch(/speaker\.imageurl/i);
  });

  it('ships chat policy repair through the default tenant migration command', () => {
    const migration = fs.readFileSync(meetingChatPolicyRepairMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('meeting-chat-e2e');
    expect(config.groups['meeting-chat-e2e']).toContain(
      'db/migrations/V066__restore_meeting_chat_messages_policies.sql',
    );
    expect(migration).toMatch(/ALTER TABLE public\.meeting_chat_messages ADD COLUMN IF NOT EXISTS/i);
    expect(migration).toMatch(/CREATE POLICY meeting_chat_messages_select_participant/i);
    expect(migration).toMatch(/CREATE POLICY meeting_chat_messages_insert_participant/i);
  });
});

describe('legacy table hardening and tenant cleanup migration contract', () => {
  it('guards missing directus legacy tables and ships via default tenant migrations', () => {
    const migration = fs.readFileSync(legacyDirectusRlsMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('rls-hardening');
    expect(config.groups['rls-hardening']).toContain(
      'db/migrations/V063__enable_rls_on_legacy_directus_tables.sql',
    );
    expect(migration).toMatch(/FOREACH tbl IN ARRAY legacy_tables/i);
    expect(migration).toMatch(/EXECUTE format\('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY'/i);
    expect(migration).toMatch(/information_schema\.tables/i);
  });

  it('ships dead table cleanup through the default tenant migration command', () => {
    const migration = fs.readFileSync(deadTableCleanupMigrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(config.defaultGroups).toContain('tenant-schema-cleanup');
    expect(config.groups['tenant-schema-cleanup']).toContain(
      'db/migrations/V064__drop_dead_matchmaking_and_orphaned_tables.sql',
    );
    expect(migration).toMatch(/DROP TABLE IF EXISTS public\.chat_messages CASCADE/i);
    expect(migration).toMatch(/DROP TABLE IF EXISTS public\.user_transactions CASCADE/i);
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

  it('requires verified email ownership, reports completed claims, and releases claims before auth deletion', () => {
    const migration = fs.existsSync(speakerIdentityClaimsFollowUpMigrationPath)
      ? fs.readFileSync(speakerIdentityClaimsFollowUpMigrationPath, 'utf8')
      : '';
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/NEW\.email_confirmed_at IS NULL/i);
    expect(migration).not.toMatch(/NEW\.confirmed_at IS NULL/i);
    expect(migration).toMatch(/email_confirmed_at IS NOT NULL/i);
    expect(migration).not.toMatch(/email_confirmed_at IS NOT NULL OR confirmed_at IS NOT NULL/i);
    expect(migration).toMatch(/SELECT status[\s\S]*INTO v_claim_status[\s\S]*speaker_identity_claims/i);
    expect(migration).toMatch(/jsonb_build_object\([\s\S]*'status', v_claim_status/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.release_speaker_identity_claim_before_auth_user_delete/i);
    expect(migration).toMatch(/BEFORE DELETE ON auth\.users/i);
    expect(migration).toMatch(/SET status = 'unclaimed',[\s\S]*claimed_user_id = NULL,[\s\S]*claimed_at = NULL/i);
    expect(config.groups['speaker-identity-claims']).toContain(
      'db/migrations/V029__harden_speaker_identity_claims.sql',
    );
  });

  it('lets event admins manage an existing speaker account assignment through an audited RPC', () => {
    const migrationPath = path.join(root, 'db/migrations/V033__enable_event_admin_speaker_role_management.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_manage_speaker_role/i);
    expect(migration).toMatch(/has_event_admin_access\(p_actor_user_id, p_event_id, false\)/i);
    expect(migration).toMatch(/FROM auth\.users/i);
    expect(migration).toMatch(/UPDATE public\.bsl_speakers[\s\S]*SET user_id = v_target_user_id/i);
    expect(migration).toMatch(/INSERT INTO public\.admin_action_log/i);
    expect(migration).toMatch(/p_action NOT IN \('grant', 'revoke', 'activate', 'deactivate'\)/i);
    expect(config.groups['speaker-identity-claims']).toContain(
      'db/migrations/V033__enable_event_admin_speaker_role_management.sql',
    );
  });
});

describe('pass claim-code migration contract', () => {
  it('redeems hashed courtesy codes atomically for the authenticated pass holder', () => {
    const migration = fs.existsSync(passClaimCodeMigrationPath)
      ? fs.readFileSync(passClaimCodeMigrationPath, 'utf8')
      : '';
    const config = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.pass_claim_codes/i);
    expect(migration).toMatch(/code_hash text NOT NULL UNIQUE/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.pass_code_claims/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_event_pass_code/i);
    expect(migration).toMatch(/auth\.uid\(\) IS NULL/i);
    expect(migration).toMatch(/FOR UPDATE/i);
    expect(migration).toMatch(/max_claims/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_event_pass_code\(text\) TO authenticated/i);
    expect(config.groups['upcoming-bsl-passes']).toContain(
      'db/migrations/V030__add_secure_pass_claim_codes.sql',
    );
  });
});
