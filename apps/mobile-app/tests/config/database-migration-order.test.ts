import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");

describe("CBWeek migration plans", () => {
  it("ships the support schema through every default tenant migration plan", () => {
    for (const profile of ["core-development", "core-production", "bsl-development", "bsl-production"]) {
      const plan = execFileSync(process.execPath, [
        "packages/tools/scripts/migrate-tenant-db.mjs",
        "--profile", profile, "--dry-run",
      ], { cwd: root, encoding: "utf8" });

      expect(plan).toContain("db/migrations/V097__support_system.sql");
    }
  });

  it("runs event search aliases after the CBWeek bootstrap on BSL development", () => {
    const plan = execFileSync(process.execPath, [
      "packages/tools/scripts/migrate-tenant-db.mjs",
      "--profile", "bsl-development", "--dry-run",
    ], { cwd: root, encoding: "utf8" });
    const files = plan.split("\n").filter((line) => line.trim().startsWith("- db/"));
    const position = (migration: string) => files.findIndex((line) => line.includes(`/${migration}`));

    expect(position("V097__add_event_search_aliases.sql"))
      .toBeGreaterThan(position("V096__enable_cbweek_chat_and_speaker_order.sql"));
  });

  it.each([[], ["--groups", "demo-event-bootstrap"]])(
    "runs the final backfill after event creation and pass provisioning: %j",
    (...args: string[]) => {
      const plan = execFileSync(process.execPath, [
        "packages/tools/scripts/migrate-tenant-db.mjs",
        "--profile", "bsl-development", "--dry-run", ...args,
      ], { cwd: root, encoding: "utf8" });
      const files = plan.split("\n").filter((line) => line.trim().startsWith("- db/"));
      const position = (version: string) => files.findIndex((line) => line.includes(`/${version}__`));

      for (const version of ["V085", "V087", "V092", "V093", "V094"]) {
        expect(position(version)).toBeGreaterThanOrEqual(0);
      }
      expect(position("V087")).toBeGreaterThan(position("V085"));
      expect(position("V094")).toBeGreaterThan(position("V087"));
      expect(position("V094")).toBeGreaterThan(position("V092"));
      expect(position("V094")).toBeGreaterThan(position("V093"));
      expect(position("V096")).toBeGreaterThan(position("V094"));
      expect(
        files.filter((line) => line.includes("/V092__provision_cbweek_general_passes.sql")),
      ).toHaveLength(1);
    },
  );
});
