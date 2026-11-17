import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const migrationConfig = JSON.parse(readFileSync(
  path.join(root, "packages/tools/scripts/config/database-profiles.json"),
  "utf8",
));

describe("CBWeek migration plans", () => {
  it.each(["core-development", "core-production"])(
    "includes marketing approval and event claim migrations in %s",
    (profile) => {
      const groupNames = [
        ...migrationConfig.defaultGroups,
        ...(migrationConfig.profileGroups[profile] ?? []),
      ];
      const migrations = groupNames.flatMap((group: string) => migrationConfig.groups[group] ?? []);

      for (const migration of [
        "V166__marketing_campaign_approval.sql",
        "V167__close_cancelled_campaign_approvals.sql",
        "V168__event_scoped_ticket_claim_notifications.sql",
        "V169__cast_admin_pass_status_enum.sql",
        "V170__match_admin_pass_status_column_type.sql",
      ]) {
        expect(migrations).toContain(`db/migrations/${migration}`);
      }
    },
  );

  it.each(["core-development", "core-production"])(
    "includes wallet authenticator and email setup migrations in %s",
    (profile) => {
      const groupNames = [
        ...migrationConfig.defaultGroups,
        ...(migrationConfig.profileGroups[profile] ?? []),
      ];
      const migrations = groupNames.flatMap((group: string) => migrationConfig.groups[group] ?? []);

      expect(migrations).toContain("db/migrations/V175__authenticator_security.sql");
      expect(migrations).toContain("db/migrations/V176__wallet_email_two_factor.sql");
    },
  );

  it("keeps the companion email confirmation purpose when extending OTP purposes", () => {
    const migration = readFileSync(path.join(root, "db/migrations/V176__wallet_email_two_factor.sql"), "utf8");
    expect(migration).toContain("'companion-email-confirm'");
    expect(migration).toContain("'wallet-authenticator-setup'");
  });

  it("ships the support schema through every default tenant migration plan", () => {
    for (const profile of ["core-development", "core-production", "bsl-development"]) {
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

  it.each(["core-development", "core-production"])(
    "plans contact messaging after the identity-mode wrappers it extends in %s",
    (profile) => {
      const plan = execFileSync(process.execPath, [
        "packages/tools/scripts/migrate-tenant-db.mjs",
        "--profile", profile, "--dry-run",
      ], { cwd: root, encoding: "utf8" });
      const files = plan.split("\n").filter((line) => line.trim().startsWith("- db/"));
      const position = (version: string) => files.findIndex((line) => line.includes(`/${version}__`));

      expect(position("V180")).toBeGreaterThan(position("V134"));
      expect(position("V180")).toBeGreaterThan(position("V135"));
    },
  );

  it("lets event-scoped speakers use the verified-email claim flow", () => {
    const migration = readFileSync(
      path.join(root, "db/migrations/V183__event_scoped_speaker_claims.sql"),
      "utf8",
    );
    for (const fn of [
      "submit_speaker_profile_claim",
      "verify_speaker_claim_email",
      "list_speaker_claim_requests",
      "review_speaker_profile_claim",
    ]) {
      expect(migration).toContain(`FUNCTION public.${fn}(`);
    }
    expect(migration).toContain("FROM public.speakers");
    expect(migration).toContain("UPDATE public.speakers");
    for (const profile of ["core-development", "core-production"]) {
      const names = [...migrationConfig.defaultGroups, ...(migrationConfig.profileGroups[profile] ?? [])];
      const migrations = names.flatMap((group: string) => migrationConfig.groups[group] ?? []);
      expect(migrations).toContain("db/migrations/V183__event_scoped_speaker_claims.sql");
    }
  });

  it("registers the CBWeek schedule and event-scoped speaker role migrations", () => {
    const schedule = readFileSync(
      path.join(root, "db/migrations/V184__cbweek2026_official_schedule.sql"),
      "utf8",
    );
    expect(schedule).toContain("2026-12-11T19:30:00-05:00");
    expect(schedule).toContain("2026-12-12T07:30:00-05:00");
    expect(schedule.replace(/^--.*$/gm, "")).not.toMatch(/colombia2026/);
    const roles = readFileSync(
      path.join(root, "db/migrations/V185__event_scoped_speaker_admin_roles.sql"),
      "utf8",
    );
    expect(roles).toContain("FUNCTION public.admin_manage_speaker_role(");
    expect(roles).toContain("FROM public.speakers");
    expect(roles).toContain("UPDATE public.speakers");
    for (const profile of ["core-development", "core-production"]) {
      const names = [...migrationConfig.defaultGroups, ...(migrationConfig.profileGroups[profile] ?? [])];
      const migrations = names.flatMap((group: string) => migrationConfig.groups[group] ?? []);
      expect(migrations).toContain("db/migrations/V184__cbweek2026_official_schedule.sql");
      expect(migrations).toContain("db/migrations/V185__event_scoped_speaker_admin_roles.sql");
    }
  });
  it("registers the cbweek2026 chat room for production as well as development", () => {
    const room = readFileSync(
      path.join(root, "db/migrations/V187__cbweek2026_chat_room.sql"),
      "utf8",
    ).replace(/^--.*$/gm, "");
    expect(room).toContain("INSERT INTO public.event_chat_rooms");
    expect(room).toContain("'cbweek2026'");
    expect(room).not.toMatch(/colombia2026/);
    for (const profile of ["core-development", "core-production"]) {
      const names = [...migrationConfig.defaultGroups, ...(migrationConfig.profileGroups[profile] ?? [])];
      const migrations = names.flatMap((group: string) => migrationConfig.groups[group] ?? []);
      expect(migrations).toContain("db/migrations/V187__cbweek2026_chat_room.sql");
      expect(migrations.indexOf("db/migrations/V187__cbweek2026_chat_room.sql")).toBeGreaterThan(
        migrations.indexOf("db/migrations/V073__event_chat_room_registry.sql"),
      );
    }
  });
});
