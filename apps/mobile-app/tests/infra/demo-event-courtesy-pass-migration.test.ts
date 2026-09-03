/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const migrationPath = resolve(repoRoot, 'db/migrations/V088__provision_demo_event_courtesy_general_passes.sql');
const cbweekPastEditionSpeakersMigrationPath = resolve(repoRoot, 'db/migrations/V091__add_cbweek_past_edition_speaker_references.sql');
const profilesPath = resolve(repoRoot, 'packages/tools/scripts/config/database-profiles.json');

describe('demo-event courtesy General pass provisioning', () => {
  it('provisions one free General pass for each confirmed user of every demo event', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('create_demo_general_pass_for_user');
    expect(migration).toMatch(/WHERE\s+e\.is_demo/);
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/pass_type\s*=\s*'general'::pass_type/);
    expect(migration).toMatch(/status\s*=\s*'active'/);
    expect(migration).toMatch(/price_cents[\s\S]{0,180}0/);
  });

  it('runs only for the BSL development demo database', () => {
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf8')) as {
      groups: Record<string, string[]>;
    };

    expect(profiles.groups['demo-event-bootstrap']).toContain(
      'db/migrations/V088__provision_demo_event_courtesy_general_passes.sql',
    );
  });

  it('applies the CBWeek past-edition speaker references to the demo-event bootstrap profile', () => {
    const migration = readFileSync(cbweekPastEditionSpeakersMigrationPath, 'utf8');
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf8')) as {
      groups: Record<string, string[]>;
    };

    expect(migration).toContain('is_past_edition_reference');
    expect(migration).toContain("'cbweek2026'");
    expect(profiles.groups['demo-event-bootstrap']).toContain(
      'db/migrations/V091__add_cbweek_past_edition_speaker_references.sql',
    );
  });
});
