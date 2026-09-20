/**
 * Static allow-list of app ids the support widget/SDK may be embedded under.
 *
 * There is no tenant/application registry table in this database (see
 * db/migrations/V065__support_system.sql's header comment) -- the closest
 * existing concept is the hostname-keyed SSO_CONFIG.tenants map in
 * packages/config/src/sso-config.ts, whose slugs this list intentionally
 * mirrors so a new event tenant doesn't need two separate "which apps exist"
 * lists kept in sync. Widget config (locale/position/greeting/theme) is
 * admin-editable follow-up work; for now it is a code-level default per app.
 */

// Intentionally not imported from @hashpass/sdk: these are plain JSON shapes
// the route layer controls and serializes itself, matching (but not sharing
// a module boundary with) WidgetConfiguration in packages/sdk/src/support/types.ts.
// Importing the client SDK's types here would make apps/mobile-app depend on
// @hashpass/sdk at build time for zero runtime benefit (see the webhook route
// for the one place a real runtime package dependency -- @hashpass/support-kapso -- is
// actually necessary and was wired up with a build step accordingly).
export interface SupportAppConfig {
  appId: string;
  locale: "en" | "es" | (string & {});
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  greeting: string;
  theme?: { color?: string; logoUrl?: string; launcherIconUrl?: string };
}

const SUPPORT_APPS: Record<string, SupportAppConfig> = {
  core: {
    appId: "core",
    locale: "en",
    position: "bottom-right",
    greeting: "Hi! How can we help?",
    theme: { color: "#06b6d4" },
  },
  mobile: {
    appId: "mobile",
    locale: "en",
    position: "bottom-right",
    greeting: "Hi! How can we help?",
    theme: { color: "#06b6d4" },
  },
  bsl: {
    appId: "bsl",
    locale: "en",
    position: "bottom-right",
    greeting: "Need help with your BSL pass or agenda?",
    theme: { color: "#f97316" },
  },
  "bsl-2025": {
    appId: "bsl-2025",
    locale: "en",
    position: "bottom-right",
    greeting: "Need help with your BSL pass or agenda?",
    theme: { color: "#f97316" },
  },
  "bsl-dev": {
    appId: "bsl-dev",
    locale: "en",
    position: "bottom-right",
    greeting: "Need help with your BSL pass or agenda?",
    theme: { color: "#f97316" },
  },
  peru2026: {
    appId: "peru2026",
    locale: "es",
    position: "bottom-right",
    greeting: "¿En qué podemos ayudarte?",
    theme: { color: "#f97316" },
  },
  chile2026: {
    appId: "chile2026",
    locale: "es",
    position: "bottom-right",
    greeting: "¿En qué podemos ayudarte?",
    theme: { color: "#f97316" },
  },
  colombia2026: {
    appId: "colombia2026",
    locale: "es",
    position: "bottom-right",
    greeting: "¿En qué podemos ayudarte?",
    theme: { color: "#f97316" },
  },
};

export function getSupportAppConfig(appId: string | null | undefined): SupportAppConfig | null {
  const normalized = (appId ?? "").trim();
  if (!normalized) return null;
  return SUPPORT_APPS[normalized] ?? null;
}

export function isKnownSupportApp(appId: string | null | undefined): boolean {
  return getSupportAppConfig(appId) !== null;
}
