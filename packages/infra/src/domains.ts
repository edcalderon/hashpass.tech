export const BSL_DOMAINS = {
  dev: "bsl-dev.hashpass.tech",
  production: "bsl.hashpass.tech",
} as const;

// BSL is a client-routed Expo web app. The current production distribution
// uses an S3 website origin, which otherwise returns the `index.html` body
// with a 404 status for direct routes such as `/home` and
// `/dashboard/explore`. Rewriting only application routes at viewer request
// keeps the HTTP response a real 200 and prevents an old client from treating
// its own bootstrap navigation as a failed load/reload cycle.
//
// Keep this as a self-contained snippet: SST injects it into its CloudFront
// viewer-request function, where `event` is already in scope.
export const BSL_SPA_FALLBACK_REWRITE = `
const uri = event.request.uri || "/";
const isStaticAsset =
  uri.startsWith("/_expo/") ||
  uri.startsWith("/assets/") ||
  uri.startsWith("/config/") ||
  uri.startsWith("/api/") ||
  uri.startsWith("/.well-known/") ||
  /\\/[^/]+\\.[A-Za-z0-9]+$/.test(uri);

if (!isStaticAsset && uri !== "/index.html") {
  event.request.uri = "/index.html";
}
`;

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
