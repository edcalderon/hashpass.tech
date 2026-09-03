import { hostnameFromRequest, type SupabaseProfileId } from "@/config/supabase-profiles";

const BSL_EVENT_PATTERN = /^(?:bsl|bsl2025|peru2026|chile2026|colombia2026|cbweek2026|criptolatinfest)$/i;

/**
 * Resolves a server database profile from the event identity, not merely the
 * request host. Shared API calls arrive through api(-dev).hashpass.tech and
 * would otherwise lose a whitelabel tenant's database affinity.
 */
export function getEventSupabaseProfileId(
  request: Request,
  eventId: string,
): SupabaseProfileId | undefined {
  if (!BSL_EVENT_PATTERN.test(eventId)) return undefined;

  const host = hostnameFromRequest(request);
  return host === "bsl-dev.hashpass.tech" ||
    host === "api-dev.hashpass.tech" ||
    host === "localhost" ||
    host === "127.0.0.1"
    ? "bsl-development"
    : "bsl-production";
}
