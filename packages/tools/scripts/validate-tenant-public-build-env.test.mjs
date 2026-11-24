import assert from "node:assert/strict";
import test from "node:test";
import {
  runTenantPublicBuildEnvCli,
  validateTenantPublicBuildEnv,
} from "./validate-tenant-public-build-env.mjs";

function cbweekProductionConfig(overrides = {}) {
  return JSON.stringify({
    BUILD_ENV: "production",
    EXPO_PUBLIC_API_BASE_URL: "https://api.hashpass.tech/api",
    EXPO_PUBLIC_EVENT_TENANT: "cbweek2026",
    EXPO_PUBLIC_SITE_URL: "https://cbweek2026.hashpass.tech",
    EXPO_PUBLIC_SUPABASE_PROFILE: "core-production",
    EXPO_PUBLIC_SUPABASE_URL_PROD: "https://fxgftanraszjjyeidvia.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD: "sb_publishable_test",
    ...overrides,
  });
}

test("accepts the configured CBWeek production public build settings", () => {
  const result = validateTenantPublicBuildEnv(
    cbweekProductionConfig(),
    "cbweek-production",
  );

  assert.equal(result.EXPO_PUBLIC_SITE_URL, "https://cbweek2026.hashpass.tech");
});

test("rejects a missing production configuration", () => {
  assert.throws(
    () => validateTenantPublicBuildEnv("", "cbweek-production"),
    /Missing public target configuration/,
  );
});

test("rejects malformed public build JSON", () => {
  assert.throws(
    () => validateTenantPublicBuildEnv("{", "cbweek-production"),
    /valid JSON/,
  );
});

test("rejects an empty public build object", () => {
  assert.throws(
    () => validateTenantPublicBuildEnv("{}", "cbweek-production"),
    /Missing public target configuration/,
  );
});

test("rejects the old CBWeek alias as the production site URL", () => {
  assert.throws(
    () =>
      validateTenantPublicBuildEnv(
        cbweekProductionConfig({
          EXPO_PUBLIC_SITE_URL: "https://cbweek.hashpass.tech",
        }),
        "cbweek-production",
      ),
    /Invalid CBWeek production setting: EXPO_PUBLIC_SITE_URL/,
  );
});

test("rejects missing production API and tenant settings", () => {
  assert.throws(
    () =>
      validateTenantPublicBuildEnv(
        cbweekProductionConfig({ EXPO_PUBLIC_API_BASE_URL: undefined }),
        "cbweek-production",
      ),
    /Invalid CBWeek production setting: EXPO_PUBLIC_API_BASE_URL/,
  );
});

test("rejects missing core production Supabase public credentials", () => {
  assert.throws(
    () =>
      validateTenantPublicBuildEnv(
        cbweekProductionConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD: "" }),
        "cbweek-production",
      ),
    /requires core production Supabase public configuration/,
  );
});

test("rejects non-public and secret-like settings", () => {
  assert.throws(
    () =>
      validateTenantPublicBuildEnv(
        cbweekProductionConfig({ SUPABASE_SERVICE_ROLE_KEY: "do-not-use" }),
        "cbweek-production",
      ),
    /Invalid public build setting: SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("rejects BSL aliases in CBWeek production configuration", () => {
  assert.throws(
    () =>
      validateTenantPublicBuildEnv(
        cbweekProductionConfig({ EXPO_PUBLIC_BSL_EVENT_TENANT: "bsl" }),
        "cbweek-production",
      ),
    /cannot use BSL configuration aliases/,
  );
});

test("writes validated public settings to GITHUB_ENV for tenant builds", () => {
  const appended = [];
  const stdout = { write: (value) => appended.push(value) };

  const exitCode = runTenantPublicBuildEnvCli({
    args: ["cbweek-production"],
    env: {
      GITHUB_ENV: "/github/env",
      PUBLIC_BUILD_ENV: cbweekProductionConfig(),
    },
    appendFile: (path, value) => appended.push(`${path}:${value}`),
    stdout,
  });

  assert.equal(exitCode, 0);
  assert.ok(
    appended.includes(
      "/github/env:EXPO_PUBLIC_SITE_URL=https://cbweek2026.hashpass.tech\n",
    ),
  );
  assert.match(appended.at(-1), /passed validation/);
});

test("validates without writing to GITHUB_ENV in validate-only mode", () => {
  const appended = [];
  const exitCode = runTenantPublicBuildEnvCli({
    args: ["cbweek-production", "--validate-only"],
    env: {
      GITHUB_ENV: "/github/env",
      PUBLIC_BUILD_ENV: cbweekProductionConfig(),
    },
    appendFile: (...args) => appended.push(args),
    stdout: { write: (value) => appended.push(value) },
  });

  assert.equal(exitCode, 0);
  assert.equal(appended.length, 1);
  assert.match(appended[0], /passed validation/);
});

test("reports CLI validation failures without exposing configured values", () => {
  const stderr = [];
  const exitCode = runTenantPublicBuildEnvCli({
    args: ["cbweek-production", "--validate-only"],
    env: { PUBLIC_BUILD_ENV: "" },
    stderr: { write: (value) => stderr.push(value) },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr[0], /Missing public target configuration/);
});
