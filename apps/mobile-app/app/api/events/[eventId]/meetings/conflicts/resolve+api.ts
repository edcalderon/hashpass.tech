import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { eventIdFromRequest } from "@/lib/server/event-api";
import { authenticatedIdentity } from "@/lib/server/authenticated-meeting-identity";

const ACTIONS = new Set(["replace", "keep_existing"]);

export async function POST(request: Request) {
  const auth = await authenticatedIdentity(request);
  if ("response" in auth) return auth.response;
  const eventId = eventIdFromRequest(request);
  if (!eventId)
    return Response.json({ error: "A valid event id is required" }, { status: 400 });

  const body = await request.json().catch(() => null);
  if (!body?.meetingId || !ACTIONS.has(body?.action))
    return Response.json(
      { error: "meetingId and a valid action are required" },
      { status: 400 },
    );

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id")
      .eq("id", body.meetingId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (meetingError) throw meetingError;
    if (!meeting)
      return Response.json(
        { error: "Meeting was not found for this event" },
        { status: 404 },
      );

    const { data, error } = await supabase.rpc("resolve_meeting_slot_conflict", {
      p_meeting_id: body.meetingId,
      p_user_id: auth.meetingUserId,
      p_action: body.action,
    });
    if (error) throw error;
    if (!data?.success)
      return Response.json(
        { error: data?.error || "Failed to resolve conflict" },
        { status: 409 },
      );
    return Response.json({ data });
  } catch (error: any) {
    console.error("[meeting-conflicts] resolve error:", error);
    return Response.json(
      { error: error?.message || "Failed to resolve conflict" },
      { status: 500 },
    );
  }
}
