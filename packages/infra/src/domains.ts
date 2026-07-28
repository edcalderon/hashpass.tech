export const BSL_DOMAINS = {
  dev: "bsl-dev.hashpass.tech",
  production: "bsl.hashpass.tech",
} as const;

// bsl.hashpass.tech's own GA4 property, distinct from hashpass.tech's
// (G-BY2BLQFHC9, set via the root .env for the core site's separate build
// pipeline). This StaticSite build never reads the root .env
// (SKIP_ENV_PROPAGATE=1 in sst.config.ts), so the core site's GA id has no
// way to leak in here — it must be set explicitly in this file instead.
const BSL_GA_MEASUREMENT_ID = "G-6E50P9CCJG";

export const BSL_SITE_ENV = {
  dev: {
    BUILD_ENV: "dev",
    EXPO_PUBLIC_API_BASE_URL: "https://api-dev.hashpass.tech/api",
    EXPO_PUBLIC_BETTER_AUTH_URL: "https://api-dev.hashpass.tech/api/auth",
    EXPO_PUBLIC_DIRECTUS_URL: "https://sso-dev.hashpass.co",
    EXPO_PUBLIC_SITE_URL: "https://bsl-dev.hashpass.tech",
    EXPO_PUBLIC_GA_MEASUREMENT_ID: BSL_GA_MEASUREMENT_ID,
  },
  production: {
    BUILD_ENV: "production",
    EXPO_PUBLIC_API_BASE_URL: "https://api.hashpass.tech/api",
    EXPO_PUBLIC_BETTER_AUTH_URL: "https://api.hashpass.tech/api/auth",
    EXPO_PUBLIC_DIRECTUS_URL: "https://sso.hashpass.co",
    EXPO_PUBLIC_SITE_URL: "https://bsl.hashpass.tech",
    EXPO_PUBLIC_GA_MEASUREMENT_ID: BSL_GA_MEASUREMENT_ID,
  },
} as const;

export type BslStage = keyof typeof BSL_SITE_ENV;

export function resolveBslStage(stage?: string): BslStage {
  return stage === "production" ? "production" : "dev";
}

export function getBslSiteConfig(stage?: string) {
  const resolvedStage = resolveBslStage(stage);

  return {
    stage: resolvedStage,
    domain: BSL_DOMAINS[resolvedStage],
    environment: BSL_SITE_ENV[resolvedStage],
  };
}
