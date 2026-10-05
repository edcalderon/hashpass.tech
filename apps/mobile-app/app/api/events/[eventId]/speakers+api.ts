import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { eventIdFromRequest, isEventSectionPublic } from "@/lib/server/event-api";
import { resolveNotificationIdentity, isResolveIdentityError } from "@/lib/server/resolve-notification-identity";

// Speaker directory access is server-owned so browser clients do not couple to
// the current Supabase schema or credentials.
export async function GET(request: Request) {
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json(
      { error: "A valid event id is required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerForRequest(request);

  // This route runs on the service-role client (bypasses RLS), so the
  // organizer's speakers_public toggle has to be enforced here -- covers
  // both the legacy bsl_speakers table and the newer speakers table below.
  const speakersPublic = await isEventSectionPublic(supabase, eventId, "speakers_public");
  if (!speakersPublic) {
    // Guest-only gate (db/migrations/V109) -- a signed-in attendee must still
    // see a private event's real directory via the same dashboard links that
    // already route them here, so only deny once there's no session at all.
    const identity = await resolveNotificationIdentity(request);
    if (isResolveIdentityError(identity)) {
      // `public: false` lets callers (speakers/calendar.tsx) tell "hidden"
      // apart from a genuinely empty directory, so they don't fall back to
      // bundled config speakers and defeat this gate.
      return Response.json({ data: [], public: false });
    }
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const usesLegacyBslDirectory =
    /^(?:bsl|bsl2025|peru2026|chile2026|colombia2026)$/i.test(eventId);
  const legacyEventId =
    eventId.toLowerCase() === "bsl" ? "bsl2025" : eventId.toLowerCase();
  let query = usesLegacyBslDirectory
    ? supabase
        .from("bsl_speakers")
        .select("id, name, title, company, imageurl, user_id, is_active")
        .eq("event_id", legacyEventId)
        .eq("is_active", true)
        .not("id", "is", null)
        .order("name", { ascending: true })
    : supabase
        .from("speakers")
        .select(
          "id, event_id, name, title, company, bio, image_url, user_id, metadata, sort_order",
        )
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true });
  if (search) query = query.ilike("name", `%${search.replace(/[%_,]/g, "")}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[event-speakers] collection error:", error);
    return Response.json({ error: "Failed to load speakers" }, { status: 500 });
  }
  return Response.json({ data: data || [] });
}
