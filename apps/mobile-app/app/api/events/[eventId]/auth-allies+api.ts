import { EVENTS } from "@/config/events";
import {
  getConfiguredAuthAllyIds,
  normalizeAuthAllyIds,
} from "@/lib/event-auth-allies";
import { eventIdFromRequest } from "@/lib/server/event-api";
import { getEventSupabaseProfileId } from "@/lib/server/event-supabase-profile";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

/**
 * Public auth-screen configuration. The value contains no user or admin data
 * and is intentionally available before sign-in; it is still constrained to
 * an event's known ally registry by normalizeAuthAllyIds.
 */
export async function GET(request: Request) {
  const eventId = eventIdFromRequest(request);
  const event = eventId ? EVENTS[eventId] : null;
  if (!eventId || !event) {
    return Response.json({ error: "A known event id is required" }, { status: 404 });
  }

  const fallback = getConfiguredAuthAllyIds(event);
  const supabase = getSupabaseServerForRequest(
    request,
    getEventSupabaseProfileId(request, eventId),
  );
  const { data, error } = await supabase
    .from("event_auth_allies")
    .select("allowed_ally_ids")
    .eq("event_id", eventId)
    .maybeSingle();

  // A safe static fallback keeps sign-in usable while the settings migration
  // is rolling out or a tenant has not yet saved an override.
  if (error) {
    console.warn("[event-auth-allies] using event fallback:", error.message);
  }

  return Response.json({
    data: {
      allowedAllyIds: error
        ? fallback
        : normalizeAuthAllyIds(data?.allowed_ally_ids ?? fallback),
    },
  });
}
