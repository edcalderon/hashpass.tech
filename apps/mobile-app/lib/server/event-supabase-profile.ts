import { hostnameFromRequest, type SupabaseProfileId } from "@/config/supabase-profiles";

const BSL_EVENT_PATTERN = /^(?:bsl|bsl2025|peru2026|chile2026|colombia2026|cbweek2026)$/i;

/**
 * Resolves a server database profile from the event identity, not merely the
 * request host. Shared API calls arrive through api(-dev).hashpass.tech and
 * would otherwise lose a whitelabel tenant's database affinity. Production
 * events use the core database; the CBWeek demo host remains on the BSL
 * development profile. CBWeek's API endpoint, not its browser Origin, decides
 * which environment is allowed to select its database.
 */
export function getEventSupabaseProfileId(
  request: Request,
  eventId: string,
): SupabaseProfileId | undefined {
  if (!BSL_EVENT_PATTERN.test(eventId)) return undefined;

  if (eventId.toLowerCase() === "cbweek2026") {
    const requestHost = new URL(request.url).hostname.toLowerCase();
    return [
      "api-dev.hashpass.tech",
      "cbweek2026.hashpass.tech",
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "[::1]",
    ].includes(requestHost)
      ? "bsl-development"
      : "core-production";
  }

  const host = hostnameFromRequest(request);
  return host === "bsl-dev.hashpass.tech" ||
    host === "api-dev.hashpass.tech" ||
    host === "localhost" ||
    host === "127.0.0.1"
    ? "bsl-development"
    : "core-production";
}
