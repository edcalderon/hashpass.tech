import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  resolveNotificationIdentity,
  isResolveIdentityError,
} from "@/lib/server/resolve-notification-identity";
import { eventIdFromRequest } from "@/lib/server/event-api";

// speakerId is polymorphic across this API surface, same as
// get_speaker_available_slots' own resolution via get_speaker_by_id_or_slug:
// callers may pass either bsl_speakers.id or bsl_speakers.user_id (
// meeting_requests.speaker_id stores the latter), so this lookup tries both.
async function resolveSpeakerUserId(supabase: any, speakerId: string) {
  const { data: byId, error: byIdError } = await supabase
    .from("bsl_speakers")
    .select("user_id")
    .eq("id", speakerId)
    .maybeSingle();
  if (byIdError) throw byIdError;
  if (byId?.user_id) return byId.user_id as string;

  const { data: byUserId, error: byUserIdError } = await supabase
    .from("bsl_speakers")
    .select("user_id")
    .eq("user_id", speakerId)
    .maybeSingle();
  if (byUserIdError) throw byUserIdError;
  return (byUserId?.user_id as string | undefined) ?? null;
}

// Returns conflict-safe speaker slots plus demand metadata. A slot with three
// or more pending requests is marked as a hot spot so the speaker can avoid
// treating tentative demand as a confirmed booking.
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity))
    return Response.json(
      { error: identity.error },
      { status: identity.status },
    );
  const meetingUserId = identity.supabaseUserId;
  if (!meetingUserId)
    return Response.json(
      { error: "Meeting identity required" },
      { status: 403 },
    );

  const url = new URL(request.url);
  const speakerId = url.searchParams.get("speakerId");
  const duration = Number(url.searchParams.get("durationMinutes")) || 15;
  if (!speakerId)
    return Response.json({ error: "speakerId is required" }, { status: 400 });
  const eventId = eventIdFromRequest(request);
  if (!eventId)
    return Response.json({ error: "A valid event id is required" }, { status: 400 });

  const supabase = getSupabaseServerForRequest(request);
  try {
    const params: Record<string, unknown> = {
      p_speaker_id: speakerId,
      p_date: null,
      p_duration_minutes: duration,
      p_event_id: eventId,
      p_requester_id: meetingUserId,
    };
    let { data: slots, error } = await supabase.rpc(
      "get_speaker_available_slots",
      params,
    );
    // Old RPC signatures cannot keep this shared endpoint event-safe, so only
    // retry with the pre-V018 requester argument omitted. Event identity stays
    // mandatory for both calls.
    if (error?.code === "PGRST202") {
      ({ data: slots, error } = await supabase.rpc(
        "get_speaker_available_slots",
        {
          p_speaker_id: speakerId,
          p_date: null,
          p_duration_minutes: duration,
          p_event_id: eventId,
        },
      ));
    }
    if (error) throw error;

    const speakerUserId = await resolveSpeakerUserId(supabase, speakerId);
    if (!speakerUserId)
      return Response.json({ error: "Speaker not found" }, { status: 404 });

    const { data: pending, error: pendingError } = await supabase
      .from("meeting_requests")
      .select(
        "preferred_date, preferred_time, availability_window_start, availability_window_end",
      )
      .eq("speaker_id", speakerUserId)
      .eq("event_id", eventId)
      .eq("status", "pending");
    if (pendingError) throw pendingError;

    const enriched = (slots || []).map((slot: any) => {
      const slotTime = new Date(slot.slot_time).getTime();
      const demand = (pending || []).filter((item: any) => {
        if (item.availability_window_start && item.availability_window_end) {
          return (
            slotTime >= new Date(item.availability_window_start).getTime() &&
            slotTime < new Date(item.availability_window_end).getTime()
          );
        }
        if (item.preferred_date && item.preferred_time) {
          return String(slot.slot_time).startsWith(
            `${item.preferred_date}T${item.preferred_time}`,
          );
        }
        return false;
      }).length;
      return {
        ...slot,
        pending_request_count: demand,
        is_hot_spot: demand >= 3,
        capacity_state: demand >= 3 ? "hot" : demand > 0 ? "tentative" : "open",
      };
    });
    return Response.json({ data: enriched });
  } catch (error) {
    console.error("[meeting-request-slots] fetch error:", error);
    return Response.json(
      { error: "Failed to load meeting slots" },
      { status: 500 },
    );
  }
}
