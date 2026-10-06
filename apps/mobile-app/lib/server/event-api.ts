import type { getSupabaseServerForRequest } from "@/lib/supabase-server";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

/**
 * Reads the event identity from a shared event API route.
 *
 * Event identity is intentionally accepted only from `/api/events/:eventId`.
 * Query strings and request bodies are untrusted feature input and must never
 * select a different event than the route being served.
 */
export function eventIdFromRequest(request: Request): string | null {
  const pathSegments = new URL(request.url).pathname.split("/").filter(Boolean);
  const eventsIndex = pathSegments.indexOf("events");
  const eventId = eventsIndex >= 0 ? pathSegments[eventsIndex + 1] : undefined;

  return eventId && EVENT_ID_PATTERN.test(eventId) ? eventId.toLowerCase() : null;
}

/**
 * Whether an event's agenda/speaker directory should be served to an
 * unauthenticated/guest caller. Backed by `public.events.agenda_public` /
 * `speakers_public` (db/migrations/V109).
 *
 * This is an application-level check, not an RLS policy: agenda+api.ts and
 * speakers+api.ts (like this helper) run on the service-role Supabase client
 * from lib/supabase-server.ts, which bypasses RLS entirely, so a DB policy
 * alone would never actually be enforced here.
 */
export async function isEventSectionPublic(
  supabase: ReturnType<typeof getSupabaseServerForRequest>,
  eventId: string,
  column: "agenda_public" | "speakers_public",
): Promise<boolean> {
  const { data, error } = await supabase
    .from("events")
    .select(column)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    console.error(`[event-api] ${column} lookup error:`, error);
    // Fail open: matches the column's own DEFAULT true and today's real
    // state (every event's agenda/speakers are public) -- a lookup glitch
    // must never silently hide a section that's actually public.
    return true;
  }

  // Some events (legacy/ingested ones) have no public.events row yet --
  // same not-yet-migrated fallback details+api.ts uses: treat as public.
  if (!data) return true;

  return (data as Record<string, boolean>)[column] !== false;
}
