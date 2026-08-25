import { EVENTS } from "@/config/events";
import {
  getConfiguredAuthAllyIds,
  normalizeAuthAllyIds,
} from "@/lib/event-auth-allies";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { authorizeEventAdmin } from "@/lib/server/event-admin";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const getEventId = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const validateEvent = (eventId: string) =>
  EVENT_ID_PATTERN.test(eventId) && Boolean(EVENTS[eventId]);

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`admin-auth-allies:${ip}`)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const eventId = getEventId(new URL(request.url).searchParams.get("eventId"));
  if (!validateEvent(eventId)) {
    return Response.json({ error: "A known eventId is required" }, { status: 400 });
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ("response" in authorization) return authorization.response;

  const { data, error } = await authorization.supabase
    .from("event_auth_allies")
    .select("allowed_ally_ids, updated_at")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[admin-auth-allies] read failed:", error.message);
    return Response.json({ error: "Unable to load auth allies" }, { status: 500 });
  }

  return Response.json({
    data: {
      allowedAllyIds: normalizeAuthAllyIds(
        data?.allowed_ally_ids ?? getConfiguredAuthAllyIds(EVENTS[eventId]),
      ),
      updatedAt: data?.updated_at || null,
    },
  });
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`admin-auth-allies:${ip}`)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON body is required" }, { status: 400 });
  }

  const eventId = getEventId(body.eventId);
  if (!validateEvent(eventId) || !Array.isArray(body.allowedAllyIds)) {
    return Response.json(
      { error: "A known eventId and allowedAllyIds array are required" },
      { status: 400 },
    );
  }

  const authorization = await authorizeEventAdmin(request, eventId);
  if ("response" in authorization) return authorization.response;

  const allowedAllyIds = normalizeAuthAllyIds(body.allowedAllyIds);
  const { data, error } = await authorization.supabase
    .from("event_auth_allies")
    .upsert(
      {
        event_id: eventId,
        allowed_ally_ids: allowedAllyIds,
        updated_by: authorization.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    )
    .select("allowed_ally_ids, updated_at")
    .single();

  if (error) {
    console.error("[admin-auth-allies] update failed:", error.message);
    return Response.json({ error: "Unable to update auth allies" }, { status: 500 });
  }

  return Response.json({
    data: {
      allowedAllyIds: normalizeAuthAllyIds(data.allowed_ally_ids),
      updatedAt: data.updated_at,
    },
  });
}
