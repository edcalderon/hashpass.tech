import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { eventIdFromRequest } from "@/lib/server/event-api";

export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  const meetingUserId = identity.registryUserId ?? identity.supabaseUserId;
  if (!meetingUserId) {
    return Response.json({ error: "Meeting identity required" }, { status: 403 });
  }
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  }

  const { data, error } = await getSupabaseServerForRequest(request).rpc(
    "get_user_meeting_request_counts",
    { p_user_id: meetingUserId, p_event_id: eventId },
  );
  if (error) {
    console.error("[meeting-limits] fetch error:", error);
    return Response.json({ error: "Failed to load meeting request limits" }, { status: 500 });
  }
  return Response.json({ data: Array.isArray(data) ? data[0] : data });
}
