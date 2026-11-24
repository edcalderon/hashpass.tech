import fs from "node:fs";

const PUBLIC_SETTING_PATTERN =
  /^(EXPO_PUBLIC_[A-Z0-9_]+|NEXT_PUBLIC_[A-Z0-9_]+|BUILD_ENV|TARGET_STAGE|SITE_URL|FRONTEND_URL)$/;
const CBWEEK_PRODUCTION_REQUIRED = {
  EXPO_PUBLIC_API_BASE_URL: "https://api.hashpass.tech/api",
  EXPO_PUBLIC_EVENT_TENANT: "cbweek2026",
  EXPO_PUBLIC_SITE_URL: "https://cbweek2026.hashpass.tech",
  EXPO_PUBLIC_SUPABASE_PROFILE: "core-production",
};
const CORE_PRODUCTION_SUPABASE_URL = "https://fxgftanraszjjyeidvia.supabase.co";

export function validateTenantPublicBuildEnv(rawValue, target) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    throw new Error("Missing public target configuration");
  }

  let config;
  try {
    config = JSON.parse(rawValue);
  } catch {
    throw new Error("Public target configuration must be valid JSON");
  }

  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    Object.keys(config).length === 0
  ) {
    throw new Error("Missing public target configuration");
  }

  for (const [key, value] of Object.entries(config)) {
    if (
      !PUBLIC_SETTING_PATTERN.test(key) ||
      /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/.test(key) ||
      typeof value !== "string" ||
      /[\r\n]/.test(value)
    ) {
      throw new Error(`Invalid public build setting: ${key}`);
    }
  }

  if (target === "cbweek-production") {
    for (const [key, expected] of Object.entries(CBWEEK_PRODUCTION_REQUIRED)) {
      if (config[key] !== expected)
        throw new Error(`Invalid CBWeek production setting: ${key}`);
    }
    if (
      config.EXPO_PUBLIC_SUPABASE_URL_PROD !== CORE_PRODUCTION_SUPABASE_URL ||
      !(
        config.EXPO_PUBLIC_SUPABASE_KEY_PROD ||
        config.EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD
      )
    ) {
      throw new Error(
        "CBWeek production requires core production Supabase public configuration",
      );
    }
    if (Object.keys(config).some((key) => key.toUpperCase().includes("BSL"))) {
      throw new Error("CBWeek production cannot use BSL configuration aliases");
    }
  }

  return config;
}

export function runTenantPublicBuildEnvCli({
  args = process.argv.slice(2),
  env = process.env,
  appendFile = fs.appendFileSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const target = args[0] || env.TARGET;
    const config = validateTenantPublicBuildEnv(env.PUBLIC_BUILD_ENV, target);

    if (!args.includes("--validate-only") && env.GITHUB_ENV) {
      for (const [key, value] of Object.entries(config)) {
        appendFile(env.GITHUB_ENV, `${key}=${value}\n`);
      }
    }

    stdout.write(`${target} public build configuration passed validation.\n`);
    return 0;
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : "Invalid public build configuration"}\n`,
    );
    return 1;
  }
}

if (process.argv[1]?.endsWith("/validate-tenant-public-build-env.mjs")) {
  process.exitCode = runTenantPublicBuildEnvCli();
}
