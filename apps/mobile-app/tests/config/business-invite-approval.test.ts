/// <reference types="jest" />

import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  __dirname,
  "../../../../db/migrations/V102__business_invite_approval_workflow.sql",
);
const passUserIdMigrationPath = path.resolve(
  __dirname,
  "../../../../db/migrations/V105__cast_business_invite_pass_user_id.sql",
);

describe("business invite approval migration", () => {
  it("keeps the public code pending until an approved administrator grants both event entitlements", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);

    const migration = fs
      .readFileSync(migrationPath, "utf8")
      .replace(/\s+/g, " ");
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.business_invite_requests",
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.business_invite_approvers",
    );
    expect(migration).toContain(
      "extensions.digest(lower(user_record.email), 'sha256')",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.request_business_invite_for_user",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.review_business_invite_request",
    );
    expect(migration).toContain("'pending'");
    expect(migration).toContain("'approved'");
    expect(migration).toContain("'bsl'");
    expect(migration).toContain("'cbweek2026'");
  });

  it("denies browser roles direct execution of the request, review, and legacy auto-claim RPCs", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);

    const migration = fs
      .readFileSync(migrationPath, "utf8")
      .replace(/\s+/g, " ");
    for (const signature of [
      "public.request_business_invite_for_user(uuid, text)",
      "public.review_business_invite_request(uuid, uuid, text)",
      "public.claim_business_invite(text)",
    ]) {
      expect(migration).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated`,
      );
    }
    expect(migration).toContain("TO service_role");
    expect(migration).not.toContain("edward@hashpass.app");
  });

  it("casts approval lookups to the production text pass-user identifier", () => {
    expect(fs.existsSync(passUserIdMigrationPath)).toBe(true);

    const migration = fs
      .readFileSync(passUserIdMigrationPath, "utf8")
      .replace(/\s+/g, " ");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.ensure_business_invite_event_pass",
    );
    expect(migration.match(/pass\.user_id = p_user_id::text/g)).toHaveLength(2);
    expect(migration).toContain("USING v_pass_id, p_user_id::text, p_event_id");
  });
});
