export const BSL_DOMAINS = {
  dev: "bsl-dev.hashpass.tech",
  production: "bsl.hashpass.tech",
} as const;

export const BSL_SITE_ENV = {
  dev: {
    BUILD_ENV: "dev",
    EXPO_PUBLIC_API_BASE_URL: "https://api-dev.hashpass.tech/api",
    EXPO_PUBLIC_BETTER_AUTH_URL: "https://api-dev.hashpass.tech/api/bsl-auth",
    EXPO_PUBLIC_DIRECTUS_URL: "https://sso-dev.hashpass.co",
    EXPO_PUBLIC_SITE_URL: "https://bsl-dev.hashpass.tech",
  },
  production: {
    BUILD_ENV: "production",
    EXPO_PUBLIC_API_BASE_URL: "https://api.hashpass.tech/api",
    EXPO_PUBLIC_BETTER_AUTH_URL: "https://api.hashpass.tech/api/bsl-auth",
    EXPO_PUBLIC_DIRECTUS_URL: "https://sso.hashpass.co",
    EXPO_PUBLIC_SITE_URL: "https://bsl.hashpass.tech",
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
