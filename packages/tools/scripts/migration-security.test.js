const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const migrationPath = path.join(root, 'db/migrations/V011__secure_upcoming_bsl_pass_provisioning.sql');
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
});
