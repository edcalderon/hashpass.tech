const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../../db/migrations/V111__publish_speaker_profiles_and_claim_requests.sql'),
  'utf8',
);
const privacyMigrationPath = path.resolve(
  __dirname,
  '../../../db/migrations/V113__keep_unclaimed_speaker_profiles_private.sql',
);
const privacyMigration = fs.existsSync(privacyMigrationPath)
  ? fs.readFileSync(privacyMigrationPath, 'utf8')
  : '';
const enforcementMigrationPath = path.resolve(
  __dirname,
  '../../../db/migrations/V114__activate_public_speaker_profiles_and_queue_meetings.sql',
);
const enforcementMigration = fs.existsSync(enforcementMigrationPath)
  ? fs.readFileSync(enforcementMigrationPath, 'utf8')
  : '';
const repairMigrationPath = path.resolve(
  __dirname,
  '../../../db/migrations/V115__repair_speaker_claim_review_policy.sql',
);
const repairMigration = fs.existsSync(repairMigrationPath)
  ? fs.readFileSync(repairMigrationPath, 'utf8')
  : '';

describe('V111 speaker profile publication and claim requests', () => {
  it('separates public directory visibility from account ownership', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS directory_visible boolean NOT NULL DEFAULT false/i);
    expect(migration).toMatch(/UPDATE public\.bsl_speakers[\s\S]*event_id = 'colombia2026'[\s\S]*SET directory_visible = true/i);
  });

  it('requires a confirmed email and prevents duplicate pending claims', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.speaker_claim_requests/i);
    expect(migration).toMatch(/email_confirmed_at IS NOT NULL/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*speaker_claim_requests_pending_unique/i);
    expect(migration).toMatch(/status IN \('pending', 'approved', 'rejected'\)/i);
  });

  it('keeps review and linking server-side and audited', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.request_speaker_profile_claim/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.review_speaker_profile_claim/i);
    expect(migration).toMatch(/has_event_admin_access\(p_actor_user_id, v_claim\.event_id, false\)/i);
    expect(migration).toMatch(/is_active\s*=\s*true,[\s\S]*is_accepting_meetings\s*=\s*true/i);
    expect(migration).toMatch(/SET user_id = v_claim\.requester_user_id/i);
    expect(migration).toMatch(/speaker_claim\.' \|\| p_action/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.request_speaker_profile_claim/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.review_speaker_profile_claim/i);
  });
});

describe('V112 speaker meeting capability hardening', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../db/migrations/V112__disable_unclaimed_speaker_meetings.sql'),
    'utf8',
  );

  it('disables meeting acceptance for every published but unclaimed profile', () => {
    expect(migration).toMatch(/UPDATE public\.bsl_speakers/i);
    expect(migration).toMatch(/directory_visible\s*=\s*true/i);
    expect(migration).toMatch(/user_id\s+IS\s+NULL/i);
    expect(migration).toMatch(/is_accepting_meetings\s*=\s*false/i);
  });
});

describe('V113 speaker directory privacy hardening', () => {
  it('hides every unclaimed profile and keeps future imports private by default', () => {
    expect(privacyMigration).toMatch(/UPDATE public\.bsl_speakers/i);
    expect(privacyMigration).toMatch(/user_id\s+IS\s+NULL/i);
    expect(privacyMigration).toMatch(/directory_visible\s*=\s*false/i);
    expect(privacyMigration).toMatch(/V111/i);
  });
});

describe('V114 speaker activation and queued meeting requests', () => {
  it('publishes all imported profiles and keeps future unclaimed requests claimable', () => {
    expect(enforcementMigration).toMatch(/UPDATE public\.bsl_speakers/i);
    expect(enforcementMigration).toMatch(/directory_visible\s*=\s*true/i);
    expect(enforcementMigration).toMatch(/is_active\s*=\s*true/i);
    expect(enforcementMigration).toMatch(/is_accepting_meetings\s*=\s*true/i);
    expect(enforcementMigration).toMatch(/DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey/i);
    expect(enforcementMigration).toMatch(/COALESCE\(v_speaker\.user_id, v_speaker\.id::uuid\)/i);
    expect(enforcementMigration).toMatch(/link_pending_speaker_requests_on_claim/i);
    expect(enforcementMigration).toMatch(/metadata\s*->>\s*'source'/i);
  });
});

describe('V115 deployed claim review repair', () => {
  it('replaces the deployed review function with the scoped actor and active meeting policy', () => {
    expect(repairMigration).toMatch(/has_event_admin_access\(p_actor_user_id, v_claim\.event_id, false\)/i);
    expect(repairMigration).toMatch(/is_accepting_meetings\s*=\s*true/i);
    expect(repairMigration).toMatch(/metadata\s*->>\s*'source'/i);
  });
});
