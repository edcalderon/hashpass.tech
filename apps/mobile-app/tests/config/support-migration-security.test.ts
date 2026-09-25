/// <reference types="jest" />

import fs from "fs";
import path from "path";

const bootstrapMigrationPath = path.resolve(
  __dirname,
  "../../../../db/migrations/V097__support_system.sql",
);
const rolloutMigrationPath = path.resolve(
  __dirname,
  "../../../../db/migrations/V098__harden_support_system.sql",
);

describe("support-system migration security contract", () => {
  it("revokes every SECURITY DEFINER support RPC from public roles before service-role grants", () => {
    const migration = fs.readFileSync(bootstrapMigrationPath, "utf8");

    for (const signature of [
      "create_support_session(text, text, timestamptz, text, text, text, text, jsonb)",
      "create_support_ticket(text, uuid, text, text, text, jsonb)",
      "send_support_message(uuid, uuid, text)",
      "set_ticket_status(uuid, uuid, text)",
      "request_ticket_handoff(uuid, uuid)",
      "mark_ticket_read(uuid, uuid, text)",
      "list_support_events(uuid, uuid, text, integer)",
      "list_support_tickets_for_visitor(uuid, text, uuid, integer)",
      "list_support_messages(uuid, uuid, uuid, integer)",
      "list_support_tickets_admin(text, text, uuid, integer)",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated`,
          "i",
        ),
      );
    }
  });

  it("scopes support idempotency keys to the support visitor", () => {
    const migration = fs.readFileSync(bootstrapMigrationPath, "utf8");

    expect(migration).toMatch(/visitor_id uuid NOT NULL/i);
    expect(migration).toMatch(/PRIMARY KEY \(app_id, visitor_id, route, key\)/i);
  });

  it("allows the API's 100-item page request to retain its lookahead row", () => {
    const migration = fs.readFileSync(bootstrapMigrationPath, "utf8");

    expect((migration.match(/LEAST\(GREATEST\(COALESCE\(p_limit,[^)]+\), 1\), 101\)/gi) ?? [])).toHaveLength(3);
  });

  it("provides a rollout migration for already-provisioned support databases", () => {
    const migration = fs.readFileSync(rolloutMigrationPath, "utf8");

    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS visitor_id uuid/i);
    expect(migration).toMatch(/DELETE FROM public\.support_idempotency_keys\s+WHERE visitor_id IS NULL/i);
    expect(migration).toMatch(/PRIMARY KEY \(app_id, visitor_id, route, key\)/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.list_support_tickets_admin\(text, text, uuid, integer\)\s+FROM PUBLIC, anon, authenticated/i);
  });
});
