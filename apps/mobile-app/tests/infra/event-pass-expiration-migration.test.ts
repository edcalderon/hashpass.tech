/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const migrationPath = resolve(
  repoRoot,
  'db/migrations/V177__backend_event_pass_metadata_and_expiration.sql',
);
const qrExpirationMigrationPath = resolve(
  repoRoot,
  'db/migrations/V179__require_event_for_pass_qr_validation.sql',
);
const profilesPath = resolve(repoRoot, 'packages/tools/scripts/config/database-profiles.json');

describe('backend event pass metadata and expiration', () => {
  it('stores BSL pass styling and expires active passes after their event end time', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain("'walletPassStyle', 'event'");
    expect(migration).toContain("'walletPassColor', '#00A9E0'");
    expect(migration).toContain('public.expire_ended_event_passes');
    expect(migration).toMatch(/pass\.status\s*=\s*'active'[\s\S]*event\.ends_at\s*<=\s*statement_timestamp\(\)/);
    expect(migration).toContain("'hashpass-expire-ended-event-passes'");
  });

  it('applies to the shared event catalog migration group', () => {
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf8')) as {
      groups: Record<string, string[]>;
    };

    expect(profiles.groups['event-catalog']).toContain(
      'db/migrations/V177__backend_event_pass_metadata_and_expiration.sql',
    );
  });

  it('expires admission QR codes and rejects scans for inactive or ended event passes', () => {
    const migration = readFileSync(qrExpirationMigrationPath, 'utf8');

    expect(migration).toMatch(/qr\.qr_type\s*=\s*'pass'[\s\S]*event\.ends_at\s*<=\s*statement_timestamp\(\)/);
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.validate_and_use_qr');
    expect(migration).toContain("v_pass_status IS DISTINCT FROM 'active'");
    expect(migration).toContain("v_event_ends_at <= statement_timestamp()");
    expect(migration).toContain("SELECT public.expire_ended_event_passes()");
  });

  it('runs the QR expiry fix after the QR system creates its tables', () => {
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf8')) as {
      groups: Record<string, string[]>;
    };

    const qrMigrations = profiles.groups['qr-system'];
    expect(qrMigrations).toContain('db/migrations/V145__backend_qr_and_external_ticket_claims.sql');
    expect(qrMigrations).toContain('db/migrations/V178__expire_admission_qr_with_ended_passes.sql');
    expect(qrMigrations).toContain('db/migrations/V179__require_event_for_pass_qr_validation.sql');
    expect(qrMigrations.indexOf('db/migrations/V179__require_event_for_pass_qr_validation.sql'))
      .toBeGreaterThan(qrMigrations.indexOf('db/migrations/V145__backend_qr_and_external_ticket_claims.sql'));
    expect(qrMigrations.indexOf('db/migrations/V179__require_event_for_pass_qr_validation.sql'))
      .toBeGreaterThan(qrMigrations.indexOf('db/migrations/V178__expire_admission_qr_with_ended_passes.sql'));
  });
});
