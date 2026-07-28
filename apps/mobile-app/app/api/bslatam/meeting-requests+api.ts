import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  resolveNotificationIdentity,
  isResolveIdentityError,
} from "@/lib/server/resolve-notification-identity";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["accept", "decline", "cancel", "block"]);

async function authenticatedIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity))
    return {
      response: Response.json(
        { error: identity.error },
        { status: identity.status },
      ),
    };
  if (!identity.supabaseUserId)
    return {
      response: Response.json(
        { error: "Account is not linked to a meeting identity" },
        { status: 403 },
      ),
    };
  return { identity };
}

async function speakerForUser(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("bsl_speakers")
    .select("id, user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// One authenticated API boundary for the complete meeting-request lifecycle.
// Clients never need to know which database function or identity representation
// backs an operation, making this flow portable away from Supabase.
export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity))
    return Response.json(
      { error: identity.error },
      { status: identity.status },
    );
  if (!identity.supabaseUserId) return Response.json({ data: [] });
  const userId = identity.supabaseUserId;
  const url = new URL(request.url);
  const speakerId = url.searchParams.get("speakerId");
  const status = url.searchParams.get("status");
  const supabase = getSupabaseServerForRequest(request);

  try {
    if (speakerId) {
      if (!UUID_PATTERN.test(speakerId)) return Response.json({ data: [] });
      let query = supabase
        .from("meeting_requests")
        .select("*")
        .eq("requester_id", userId)
        .eq("speaker_id", speakerId);
      if (status) query = query.eq("status", status);
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      return Response.json({ data: data || [] });
    }

    const speaker = await speakerForUser(supabase, userId);
    let sentQuery = supabase
      .from("meeting_requests")
      .select("*")
      .eq("requester_id", userId);
    if (status) sentQuery = sentQuery.eq("status", status);
    const { data: sent, error: sentError } = await sentQuery.order("created_at", {
      ascending: false,
    });
    if (sentError) throw sentError;

    let incoming: any[] = [];
    if (speaker) {
      let incomingQuery = supabase
        .from("meeting_requests")
        .select("*")
        .eq("speaker_id", userId);
      if (status) incomingQuery = incomingQuery.eq("status", status);
      const { data, error } = await incomingQuery.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      incoming = data || [];
    }

    return Response.json({
      data: [
        ...(sent || []).map((item: any) => ({ ...item, _direction: "sent" })),
        ...incoming.map((item: any) => ({ ...item, _direction: "incoming" })),
      ],
    });
  } catch (error) {
    console.error("[meeting-requests] fetch error:", error);
    return Response.json(
      { error: "Failed to fetch meeting requests" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedIdentity(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body?.speakerId || !body?.speakerName || !body?.requesterName) {
    return Response.json(
      { error: "speakerId, speakerName and requesterName are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data, error } = await supabase.rpc("insert_meeting_request", {
      p_requester_id: auth.identity.supabaseUserId,
      p_speaker_id: String(body.speakerId),
      p_speaker_name: body.speakerName,
      p_requester_name: body.requesterName,
      p_requester_company: body.requesterCompany || null,
      p_requester_title: body.requesterTitle || null,
      p_requester_ticket_type: body.requesterTicketType || "general",
      p_meeting_type: body.meetingType || "networking",
      p_message: body.message || "",
      p_note: body.note || null,
      p_boost_amount: Number(body.boostAmount) || 0,
      p_duration_minutes: Number(body.durationMinutes) || 15,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false)
      return Response.json(
        { error: result.error || "Meeting request rejected" },
        { status: 409 },
      );
    return Response.json({ data: result }, { status: 201 });
  } catch (error: any) {
    console.error("[meeting-requests] create error:", error);
    return Response.json(
      { error: error?.message || "Failed to create meeting request" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await authenticatedIdentity(request);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body?.requestId || !ACTIONS.has(body?.action)) {
    return Response.json(
      { error: "requestId and a valid action are required" },
      { status: 400 },
    );
  }
  if (body.action === "block" && !body.requesterId) {
    return Response.json(
      { error: "requesterId is required to block a request" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    let rpcName: string;
    let params: Record<string, unknown>;
    if (body.action === "cancel") {
      rpcName = "cancel_meeting_request";
      params = {
        p_request_id: body.requestId,
        p_user_id: auth.identity.supabaseUserId,
      };
    } else {
      const speaker = await speakerForUser(
        supabase,
        auth.identity.supabaseUserId!,
      );
      if (!speaker)
        return Response.json(
          { error: "Only the assigned speaker can respond" },
          { status: 403 },
        );
      if (body.action === "accept") {
        if (!body.slotTime)
          return Response.json(
            { error: "slotTime is required to accept a request" },
            { status: 400 },
          );
        rpcName = "accept_meeting_request";
        params = {
          p_request_id: body.requestId,
          p_speaker_id: speaker.id,
          p_slot_start_time: body.slotTime,
          p_speaker_response: body.response || null,
        };
      } else if (body.action === "decline") {
        rpcName = "decline_meeting_request";
        params = {
          p_request_id: body.requestId,
          p_speaker_id: speaker.id,
          p_speaker_response: body.response || null,
        };
      } else {
        rpcName = "block_user_and_decline_request";
        params = {
          p_request_id: body.requestId,
          p_speaker_id: speaker.id,
          p_user_id: body.requesterId,
          p_reason: body.reason || "User has been blocked",
        };
      }
    }

    const { data, error } = await supabase.rpc(rpcName, params);
    if (error) throw error;
    const result =
      body.action === "cancel" && data === true
        ? { success: true, status: "cancelled" }
        : data;
    if (!result?.success)
      return Response.json(
        { error: result?.error || "Meeting request update failed" },
        { status: 409 },
      );
    return Response.json({ data: result });
  } catch (error: any) {
    console.error("[meeting-requests] update error:", error);
    return Response.json(
      { error: error?.message || "Failed to update meeting request" },
      { status: 500 },
    );
  }
}
