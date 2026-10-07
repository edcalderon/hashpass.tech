import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { eventIdFromRequest, isEventSectionPublic } from "@/lib/server/event-api";
import { resolveNotificationIdentity, isResolveIdentityError } from "@/lib/server/resolve-notification-identity";

function speakerIdFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const speakersIndex = segments.indexOf("speakers");
  return speakersIndex >= 0
    ? decodeURIComponent(segments[speakersIndex + 1] || "")
    : "";
}

export async function GET(request: Request) {
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json(
      { error: "A valid event id is required" },
      { status: 400 },
    );
  }
  const speakerId = speakerIdFromRequest(request);
  if (!speakerId)
    return Response.json({ error: "Missing speaker id" }, { status: 400 });

  const supabase = getSupabaseServerForRequest(request);

  // This endpoint runs on the service-role client (bypasses RLS) and was
  // never gated by speakers_public at all -- the collection route
  // (speakers+api.ts) hiding a speaker from the directory list did nothing
  // to stop a guest deep-linking straight to their id here. Same
  // guest-only gate, same signed-in-caller bypass.
  const speakersPublic = await isEventSectionPublic(supabase, eventId, "speakers_public");
  if (!speakersPublic) {
    const identity = await resolveNotificationIdentity(request);
    if (isResolveIdentityError(identity)) {
      // `public: false` on a 200 (not a 404) lets speakers/[id].tsx tell
      // "hidden" apart from "no such speaker" and skip falling back to the
      // bundled config speaker, which would defeat this gate.
      return Response.json({ data: null, public: false });
    }
  }

  const usesLegacyBslDirectory =
    /^(?:bsl|bsl2025|peru2026|chile2026|colombia2026)$/i.test(eventId);
  const legacyEventId =
    eventId.toLowerCase() === "bsl" ? "bsl2025" : eventId.toLowerCase();
  const query = usesLegacyBslDirectory
    ? supabase
        .from("bsl_speakers")
        .select(
          "id, name, title, company, bio, imageurl, linkedin, twitter, tags, availability, user_id, is_active, is_accepting_meetings, directory_visible",
        )
        .eq("event_id", legacyEventId)
        .eq("directory_visible", true)
        .eq("id", speakerId)
    : supabase
        .from("speakers")
        .select(
          "id, event_id, name, title, company, bio, image_url, social_links, metadata, user_id, sort_order",
        )
        .eq("event_id", eventId)
        .eq("id", speakerId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error("[event-speaker] detail error:", error);
    return Response.json({ error: "Failed to load speaker" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ data });
}
