import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../../..");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/V099__business_invite_campaigns.sql",
);
const multiEventMigrationPath = path.join(
  repoRoot,
  "db/migrations/V101__multi_event_business_invite_campaign.sql",
);
const approvalMigrationPath = path.join(
  repoRoot,
  "db/migrations/V102__business_invite_approval_workflow.sql",
);
const profilesPath = path.join(
  repoRoot,
  "packages/tools/scripts/config/database-profiles.json",
);

describe("business invitation campaign migration", () => {
  it("keeps the public campaign code hashed and disables the legacy automatic-claim RPC", () => {
    const migration = fs.existsSync(migrationPath)
      ? fs.readFileSync(migrationPath, "utf8").replace(/\s+/g, " ")
      : "";
    const approvalMigration = fs.existsSync(approvalMigrationPath)
      ? fs.readFileSync(approvalMigrationPath, "utf8").replace(/\s+/g, " ")
      : "";

    expect(migration).toContain("encode(digest(upper(btrim(p_code)), 'sha256'), 'hex')");
    expect(migration).toContain("FROM auth.users WHERE id = v_user_id AND email_confirmed_at IS NOT NULL");
    expect(approvalMigration).toContain(
      "REVOKE ALL ON FUNCTION public.claim_business_invite(text) FROM PUBLIC, anon, authenticated, service_role",
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
      "db/migrations/V101__multi_event_business_invite_campaign.sql",
      "db/migrations/V102__business_invite_approval_workflow.sql",
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

  it("upgrades an approved invite across the BSL and Colombia event passes", () => {
    const migration = fs.existsSync(multiEventMigrationPath)
      ? fs.readFileSync(multiEventMigrationPath, "utf8").replace(/\s+/g, " ")
      : "";

    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.business_invite_campaign_events",
    );
    expect(migration).toContain("'bsl'");
    expect(migration).toContain("'cbweek2026'");
    expect(migration).toContain("FOR v_event IN");
    expect(migration).toContain("v_pass_ids := v_pass_ids || jsonb_build_object");
    expect(migration).toContain("'pass_ids', v_pass_ids");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.claim_business_invite(text) FROM PUBLIC, anon, authenticated, service_role",
    );
  });
});
