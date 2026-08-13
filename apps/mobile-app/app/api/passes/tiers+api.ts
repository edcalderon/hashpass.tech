import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams
    .get("eventId")
    ?.trim()
    .toLowerCase();
  if (!eventId || !EVENT_ID_PATTERN.test(eventId)) {
    return Response.json(
      { error: "A valid event id is required" },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await getSupabaseServerForRequest(request).rpc(
      "get_event_pass_tiers",
      { p_event_id: eventId },
    );
    if (error) throw error;
    return Response.json({ data: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error("[pass-tiers] fetch error:", error);
    return Response.json(
      { error: "Failed to load pass tiers" },
      { status: 500 },
    );
  }
}
