import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { eventIdFromRequest } from "@/lib/server/event-api";

// Keeps the networking dashboard provider-agnostic: the browser receives one
// event-scoped read model instead of issuing RPC/table queries itself.
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  const meetingUserId = identity.supabaseUserId;
  if (!meetingUserId) {
    return Response.json({ error: "Meeting identity required" }, { status: 403 });
  }
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data: countData, error: countError } = await supabase.rpc(
      "get_user_meeting_request_counts",
      { p_user_id: meetingUserId, p_event_id: eventId },
    );
    if (countError) throw countError;

    const { data: speaker, error: speakerError } = await supabase
      .from("bsl_speakers")
      .select("id")
      .eq("user_id", meetingUserId)
      .maybeSingle();
    if (speakerError) throw speakerError;

    let blockedUsers = 0;
    let speakerRequests = 0;
    if (speaker?.id) {
      const [{ data: blocks, error: blocksError }, { data: requests, error: requestsError }] = await Promise.all([
        supabase.from("user_blocks").select("id").eq("speaker_id", speaker.id),
        supabase
          .from("meeting_requests")
          .select("id")
          .eq("speaker_id", meetingUserId)
          .eq("event_id", eventId),
      ]);
      if (blocksError) throw blocksError;
      if (requestsError) throw requestsError;
      blockedUsers = blocks?.length || 0;
      speakerRequests = requests?.length || 0;
    }

    return Response.json({
      data: {
        counts: Array.isArray(countData) ? countData[0] : countData,
        speaker: { blockedUsers, speakerRequests },
      },
    });
  } catch (error) {
    console.error("[networking-stats] fetch error:", error);
    return Response.json({ error: "Failed to load networking statistics" }, { status: 500 });
  }
}
