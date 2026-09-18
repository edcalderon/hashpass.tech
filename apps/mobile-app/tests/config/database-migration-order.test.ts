import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");

describe("CBWeek migration plans", () => {
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
      expect(files.filter((line) => line.includes("/V092__"))).toHaveLength(1);
    },
  );
});
