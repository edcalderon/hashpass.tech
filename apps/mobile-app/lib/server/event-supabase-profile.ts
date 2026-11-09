import { type SupabaseProfileId } from "@/config/supabase-profiles";

const BSL_EVENT_PATTERN = /^(?:bsl|bsl2025|peru2026|chile2026|colombia2026|cbweek2026)$/i;
const DEVELOPMENT_REQUEST_HOSTS = new Set([
  "api-dev.hashpass.tech",
  "bsl-dev.hashpass.tech",
  "cbweek2026.hashpass.tech",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);
const PRODUCTION_REQUEST_HOSTS = new Set([
  "api.hashpass.tech",
  "bsl.hashpass.tech",
  "cbweek.hashpass.tech",
]);

/**
 * Resolves the event-data profile from a first-party API request hostname when
 * the route has no event id available yet (for example, an opaque pass token).
 * Unknown hosts defer to the generic request-profile resolver.
 */
export function getEventSupabaseProfileIdForRequest(
  request: Request,
): SupabaseProfileId | undefined {
  const requestHost = new URL(request.url).hostname.toLowerCase();
  if (DEVELOPMENT_REQUEST_HOSTS.has(requestHost)) return "bsl-development";
  if (PRODUCTION_REQUEST_HOSTS.has(requestHost)) return "core-production";
  return undefined;
}

/**
 * Resolves a server database profile from the event identity, not merely the
 * request host. Shared API calls arrive through api(-dev).hashpass.tech and
 * would otherwise lose an event's database affinity. The API request hostname,
 * never the caller-controlled Origin, determines the environment: production
 * events use core production, while development and local event requests use
 * the shared BSL development profile.
 */
export function getEventSupabaseProfileId(
  request: Request,
  eventId: string,
): SupabaseProfileId | undefined {
  if (!BSL_EVENT_PATTERN.test(eventId)) return undefined;

  return getEventSupabaseProfileIdForRequest(request) ?? "core-production";
}
