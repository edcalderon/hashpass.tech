import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/V099__business_invite_campaigns.sql",
);
const profilesPath = path.join(
  repoRoot,
  "packages/tools/scripts/config/database-profiles.json",
);

describe("business invitation campaign migration", () => {
  it("keeps the public campaign code hashed and the claim RPC authenticated", () => {
    const migration = fs.existsSync(migrationPath)
      ? fs.readFileSync(migrationPath, "utf8").replace(/\s+/g, " ")
      : "";

    expect(migration).toContain("encode(digest(upper(btrim(p_code)), 'sha256'), 'hex')");
    expect(migration).toContain("FROM auth.users WHERE id = v_user_id AND email_confirmed_at IS NOT NULL");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.claim_business_invite(text) FROM PUBLIC, anon, service_role",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.claim_business_invite(text) TO authenticated",
    );
    expect(migration).toContain(
      "CREATE TRIGGER trg_provision_bsl_colombia_business_invite_campaign",
    );
  });

  it("seeds code 9899 for the live Colombia event and includes the corrective migration", () => {
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf8")) as {
      profileGroups: Record<string, string[]>;
      groups: Record<string, string[]>;
    };
    const migrations = [
      "db/migrations/V092__invite_scan_events.sql",
      "db/migrations/V099__business_invite_campaigns.sql",
      "db/migrations/V100__seed_bsl_colombia_business_invite.sql",
    ];
    const primaryMigration = fs.readFileSync(migrationPath, "utf8");

    expect(profiles.groups["business-invite-campaigns"] ?? []).toEqual(
      expect.arrayContaining(migrations),
    );
    for (const profile of [
      "core-development",
      "core-production",
      "bsl-development",
      "bsl-production",
    ]) {
      expect(profiles.profileGroups[profile] ?? []).toContain(
        "business-invite-campaigns",
      );
    }

    expect(primaryMigration).toContain("'colombia2026'");
  });
});
