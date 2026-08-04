import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { authorizeEventAdmin } from "@/lib/server/event-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PASS_TYPES = new Set(["general", "business", "vip"]);
const PASS_STATUSES = new Set([
  "active",
  "used",
  "expired",
  "cancelled",
  "suspended",
]);

export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`admin-passes:${ip}`)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = (searchParams.get("eventId") || "").trim();
  const cursor = (searchParams.get("cursor") || "").trim() || null;
  const pageSize = Math.min(
    Math.max(Number(searchParams.get("limit")) || 50, 1),
    100,
  );
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return Response.json(
      { error: "A valid eventId is required" },
      { status: 400 },
    );
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ("response" in authorization) return authorization.response;
  const { data, error } = await authorization.supabase.rpc(
    "admin_list_event_passes",
    {
      p_actor_user_id: authorization.userId,
      p_event_id: eventId,
      p_limit: pageSize,
      p_cursor: cursor,
    },
  );
  if (error) {
    console.error("Administrative pass listing failed:", error.message);
    return Response.json({ error: "Unable to list passes" }, { status: 500 });
  }
  const rows = data || [];
  return Response.json(
    {
      data: rows.slice(0, pageSize),
      nextCursor: rows.length > pageSize ? rows[pageSize - 1]?.id : null,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    },
  );
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`admin-passes:${ip}`)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON body is required" }, { status: 400 });
  }

  const action = body.action;
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : null;
  const passId = typeof body.passId === "string" ? body.passId.trim() : null;
  const passType = typeof body.passType === "string" ? body.passType : null;
  const status = typeof body.status === "string" ? body.status : null;
  const maxMeetingRequests = body.maxMeetingRequests == null ? null : Number(body.maxMeetingRequests);
  const usedMeetingRequests = body.usedMeetingRequests == null ? null : Number(body.usedMeetingRequests);
  const maxBoostAmount = body.maxBoostAmount == null ? null : Number(body.maxBoostAmount);
  const usedBoostAmount = body.usedBoostAmount == null ? null : Number(body.usedBoostAmount);

  if (
    (action !== "create" && action !== "update") ||
    !EVENT_ID_PATTERN.test(eventId)
  ) {
    return Response.json(
      { error: "A valid action and eventId are required" },
      { status: 400 },
    );
  }
  if (
    action === "create" &&
    (!userId ||
      !UUID_PATTERN.test(userId) ||
      !passType ||
      !PASS_TYPES.has(passType))
  ) {
    return Response.json(
      { error: "A valid userId and passType are required" },
      { status: 400 },
    );
  }
  if (
    action === "update" &&
    (!passId || (passType === null && status === null && maxMeetingRequests === null && usedMeetingRequests === null && maxBoostAmount === null && usedBoostAmount === null))
  ) {
    return Response.json(
      { error: "A passId and at least one change are required" },
      { status: 400 },
    );
  }
  if (
    (passType && !PASS_TYPES.has(passType)) ||
    (status && !PASS_STATUSES.has(status))
  ) {
    return Response.json(
      { error: "Invalid pass type or status" },
      { status: 400 },
    );
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ("response" in authorization) return authorization.response;

  const usageEdit = action === "update" &&
    maxMeetingRequests !== null && usedMeetingRequests !== null &&
    maxBoostAmount !== null && usedBoostAmount !== null &&
    passType === null && status === null;
  const { data, error } = usageEdit
    ? await authorization.supabase.rpc("admin_update_event_pass_usage", {
        p_actor_user_id: authorization.userId,
        p_event_id: eventId,
        p_pass_id: passId,
        p_max_meeting_requests: maxMeetingRequests,
        p_used_meeting_requests: usedMeetingRequests,
        p_max_boost_amount: maxBoostAmount,
        p_used_boost_amount: usedBoostAmount,
      })
    : await authorization.supabase.rpc("admin_mutate_event_pass", {
        p_actor_user_id: authorization.userId,
        p_event_id: eventId,
        p_action: action,
        p_user_id: userId,
        p_pass_id: passId,
        p_pass_type: passType,
        p_status: status,
      });
  if (error) {
    console.error("Administrative pass mutation failed:", error.message);
    return Response.json({ error: "Unable to update pass" }, { status: 500 });
  }

  return Response.json({ data });
}
