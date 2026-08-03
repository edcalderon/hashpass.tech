import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  resolveNotificationIdentity,
  isResolveIdentityError,
} from "@/lib/server/resolve-notification-identity";
import { eventIdFromRequest } from "@/lib/server/event-api";
import { authenticatedIdentity } from "@/lib/server/authenticated-meeting-identity";
import { sendCriticalNotificationEmail, sendMeetingNotificationEmail } from "@/lib/email";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["accept", "decline", "cancel", "block"]);
const MIN_MEETING_DURATION_MINUTES = 5;
const MAX_MEETING_DURATION_MINUTES = 30;

async function deliverMeetingEmail(details: Record<string, unknown>) {
  // Await email completion in Lambda so the runtime cannot freeze it after the
  // response. Delivery failure remains non-blocking for the meeting action.
  try {
    await sendMeetingNotificationEmail(details as any);
  } catch (error) {
    console.error("[meeting-requests] email delivery failed:", error);
  }
}

async function deliverCriticalNotificationEmail(details: Record<string, unknown>) {
  // Critical delivery is an escalation after the database notification exists;
  // it must never delay or roll back the user action that created it.
  try {
    await sendCriticalNotificationEmail(details as any);
  } catch (error) {
    console.error("[meeting-requests] critical notification email failed:", error);
  }
}

export function meetingFrontendOrigin(request: Request): string {
  const configuredOrigin = process.env.EXPO_PUBLIC_BSL_SITE_URL || process.env.BSL_FRONTEND_URL;
  if (configuredOrigin) {
    try { return new URL(configuredOrigin).origin; } catch { /* use deployment fallback */ }
  }
  try {
    if (new URL(request.url).hostname.toLowerCase() === 'api-dev.hashpass.tech') {
      return 'https://bsl-dev.hashpass.tech';
    }
  } catch { /* use production fallback */ }
  return 'https://bsl.hashpass.tech';
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

async function speakerForRecordId(supabase: any, speakerId: string) {
  const { data, error } = await supabase
    .from("bsl_speakers")
    .select("id, user_id")
    .eq("id", speakerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type RequestSpeakerProfile = {
  user_id: string;
  title: string | null;
  company: string | null;
  imageurl: string | null;
};

async function addSpeakerProfileDetails(supabase: any, requests: any[]) {
  const speakerIds = [...new Set(
    requests
      .map((request) => request.speaker_id)
      .filter((speakerId): speakerId is string => typeof speakerId === 'string' && speakerId.length > 0),
  )];
  if (!speakerIds.length) return requests;

  const { data, error } = await supabase
    .from('bsl_speakers')
    .select('user_id, title, company, imageurl')
    .in('user_id', speakerIds);
  if (error) {
    console.error('[meeting-requests] speaker profile lookup error:', error);
    return requests;
  }

  const speakerProfiles = new Map(
    ((data || []) as RequestSpeakerProfile[]).map((profile) => [profile.user_id, profile]),
  );
  return requests.map((request) => {
    const speaker = speakerProfiles.get(request.speaker_id);
    return speaker
      ? {
        ...request,
        speaker_title: speaker.title,
        speaker_company: speaker.company,
        speaker_image: speaker.imageurl,
      }
      : request;
  });
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
  const userId = identity.supabaseUserId;
  if (!userId) return Response.json({ data: [] });
  const eventId = eventIdFromRequest(request);
  if (!eventId)
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  const url = new URL(request.url);
  const speakerId = url.searchParams.get("speakerId");
  const status = url.searchParams.get("status");
  const supabase = getSupabaseServerForRequest(request);

  try {
    if (speakerId) {
      if (!UUID_PATTERN.test(speakerId)) return Response.json({ data: [] });
      const speaker = await speakerForRecordId(supabase, speakerId);
      if (!speaker?.user_id) return Response.json({ data: [] });
      let query = supabase
        .from("meeting_requests")
        .select("*")
        .eq("requester_id", userId)
        .eq("speaker_id", speaker.user_id)
        .eq("event_id", eventId);
      if (status) query = query.eq("status", status);
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      return Response.json({ data: await addSpeakerProfileDetails(supabase, data || []) });
    }

    const speaker = await speakerForUser(supabase, userId);
    let sentQuery = supabase
      .from("meeting_requests")
      .select("*")
      .eq("requester_id", userId)
      .eq("event_id", eventId);
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
        .eq("speaker_id", userId)
        .eq("event_id", eventId);
      if (status) incomingQuery = incomingQuery.eq("status", status);
      const { data, error } = await incomingQuery.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      incoming = data || [];
    }

    const requests = [
        ...(sent || []).map((item: any) => ({ ...item, _direction: "sent" })),
        ...incoming.map((item: any) => ({ ...item, _direction: "incoming" })),
      ];
    return Response.json({ data: await addSpeakerProfileDetails(supabase, requests) });
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
  const eventId = eventIdFromRequest(request);
  if (!eventId)
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (!body?.speakerId || !body?.speakerName || !body?.requesterName) {
    return Response.json(
      { error: "speakerId, speakerName and requesterName are required" },
      { status: 400 },
    );
  }
  const durationMinutes = body.durationMinutes === undefined ? 15 : Number(body.durationMinutes);
  if (
    !Number.isFinite(durationMinutes) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < MIN_MEETING_DURATION_MINUTES ||
    durationMinutes > MAX_MEETING_DURATION_MINUTES
  ) {
    return Response.json(
      { error: "durationMinutes must be between 5 and 30 minutes" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data, error } = await supabase.rpc("insert_meeting_request", {
      p_requester_id: auth.meetingUserId,
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
      p_duration_minutes: durationMinutes,
      p_event_id: eventId,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false)
      return Response.json(
        { error: result.error || "Meeting request rejected" },
        { status: 409 },
      );
    const speakerUserId = typeof result?.speaker_id === 'string' ? result.speaker_id : null;
    const meetingEmailDetails = {
      status: "requested",
      eventId,
      requesterName: body.requesterName,
      requesterCompany: body.requesterCompany,
      requesterTitle: body.requesterTitle,
      speakerName: body.speakerName,
      message: body.message,
      note: body.note,
      meetingType: body.meetingType,
      durationMinutes,
      appUrl: `${meetingFrontendOrigin(request)}/events/${encodeURIComponent(eventId)}/networking/my-requests`,
    } as const;
    // Both people receive a clear transactional record: the speaker gets the
    // action request, while the requester gets confirmation that it was sent.
    if (speakerUserId) await deliverMeetingEmail({
      ...meetingEmailDetails,
      recipientUserId: speakerUserId,
      recipientRole: 'speaker',
    });
    if (auth.meetingUserId !== speakerUserId) await deliverMeetingEmail({
      ...meetingEmailDetails,
      recipientUserId: auth.meetingUserId,
      recipientRole: 'requester',
    });
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
  const eventId = eventIdFromRequest(request);
  if (!eventId)
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
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
    const { data: meetingRequest, error: meetingRequestError } = await supabase
      .from("meeting_requests")
      .select("id, requester_id, speaker_id, requester_name, requester_company, requester_title, speaker_name, message, note, meeting_type, meeting_scheduled_at, meeting_location, duration_minutes")
      .eq("id", body.requestId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (meetingRequestError) throw meetingRequestError;
    if (!meetingRequest)
      return Response.json(
        { error: "Meeting request was not found for this event" },
        { status: 404 },
      );

    let rpcName: string;
    let params: Record<string, unknown>;
    if (body.action === "cancel") {
      rpcName = "cancel_meeting_request";
      params = {
        p_request_id: body.requestId,
        p_user_id: auth.meetingUserId,
      };
    } else {
      const speaker = await speakerForUser(
        supabase,
        auth.meetingUserId,
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
    if (body.action === "accept" || body.action === "decline") {
      const meetingEmailDetails = {
        status: body.action === "accept" ? "accepted" : "declined",
        eventId,
        requesterName: meetingRequest.requester_name,
        requesterCompany: meetingRequest.requester_company,
        requesterTitle: meetingRequest.requester_title,
        speakerName: meetingRequest.speaker_name,
        message: meetingRequest.message,
        note: meetingRequest.note,
        meetingType: meetingRequest.meeting_type,
        meetingScheduledAt: body.action === "accept" ? body.slotTime : meetingRequest.meeting_scheduled_at,
        meetingLocation: meetingRequest.meeting_location,
        durationMinutes: meetingRequest.duration_minutes,
        response: body.response,
        appUrl: `${meetingFrontendOrigin(request)}/events/${encodeURIComponent(eventId)}/networking/my-requests`,
      } as const;
      // Both participants receive the lifecycle outcome. The current
      // authenticated speaker made the response; the requester receives the
      // outcome that affects their schedule.
      await deliverMeetingEmail({
        ...meetingEmailDetails,
        recipientUserId: meetingRequest.requester_id,
        recipientRole: 'requester',
      });
      if (auth.meetingUserId !== meetingRequest.requester_id) await deliverMeetingEmail({
        ...meetingEmailDetails,
        recipientUserId: auth.meetingUserId,
        recipientRole: 'speaker',
      });
    }
    if (result?.requires_resolution === true || result?.status === 'tentative') {
      await deliverCriticalNotificationEmail({
        recipientUserId: meetingRequest.requester_id,
        notificationType: 'meeting_slot_conflict',
        title: 'Scheduling conflict — action required',
        message: `${meetingRequest.speaker_name || 'The speaker'} accepted your request, but it overlaps another meeting on your calendar.`,
        speakerName: meetingRequest.speaker_name,
        eventId,
        actionUrl: `${meetingFrontendOrigin(request)}/events/${encodeURIComponent(eventId)}/networking/my-requests`,
      });
    }
    return Response.json({ data: result });
  } catch (error: any) {
    console.error("[meeting-requests] update error:", error);
    return Response.json(
      { error: error?.message || "Failed to update meeting request" },
      { status: 500 },
    );
  }
}
