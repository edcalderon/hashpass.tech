import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { eventIdFromRequest } from "@/lib/server/event-api";

// Public, unauthenticated event detail lookup for the event-info screen.
// RLS on public.events already restricts this to published/archived rows
// (events_public_read), so no auth check is needed here -- this route must
// stay reachable by logged-out visitors landing on /events/{id}/event-info.
export async function GET(request: Request) {
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, name, slug, status, starts_at, ends_at, timezone, venue_name, venue_address, city, country, description",
    )
    .eq("id", eventId)
    .in("status", ["published", "archived"])
    .maybeSingle();

  if (error) {
    console.error("[event-details] lookup error:", error);
    return Response.json({ error: "Failed to load event details" }, { status: 500 });
  }

  // Not every event has a row in public.events yet (e.g. ingested/external
  // events like Hash Poker Room) -- the caller falls back to its own static
  // config in that case, so this is a normal, non-error outcome.
  return Response.json({ data: data || null });
}
