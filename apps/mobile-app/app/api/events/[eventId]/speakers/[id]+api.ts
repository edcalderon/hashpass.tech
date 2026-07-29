import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { eventIdFromRequest } from "@/lib/server/event-api";

function speakerIdFromRequest(request: Request) {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const speakersIndex = segments.indexOf("speakers");
  return speakersIndex >= 0 ? decodeURIComponent(segments[speakersIndex + 1] || "") : "";
}

export async function GET(request: Request) {
  if (!eventIdFromRequest(request)) {
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  }
  const speakerId = speakerIdFromRequest(request);
  if (!speakerId) return Response.json({ error: "Missing speaker id" }, { status: 400 });

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from("bsl_speakers")
    .select("id, name, title, company, bio, imageurl, linkedin, twitter, tags, availability, user_id, is_active")
    .eq("id", speakerId)
    .maybeSingle();
  if (error) {
    console.error("[event-speaker] detail error:", error);
    return Response.json({ error: "Failed to load speaker" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ data });
}
