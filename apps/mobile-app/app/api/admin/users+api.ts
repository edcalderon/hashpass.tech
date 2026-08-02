import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { authorizeEventAdmin } from "@/lib/server/event-admin";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Paginated, server-side identity search; auth.users is never exposed to the browser directly. */
export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`admin-users:${ip}`))
    return Response.json({ error: "Too many requests" }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const eventId = (searchParams.get("eventId") || "").trim();
  const query = (searchParams.get("q") || "").trim().slice(0, 100);
  const cursor = (searchParams.get("cursor") || "").trim() || null;
  const pageSize = Math.min(
    Math.max(Number(searchParams.get("limit")) || 25, 1),
    50,
  );
  if (!EVENT_ID_PATTERN.test(eventId))
    return Response.json(
      { error: "A valid eventId is required" },
      { status: 400 },
    );

  const authorization = await authorizeEventAdmin(request, eventId);
  if ("response" in authorization) return authorization.response;
  const { data, error } = await authorization.supabase.rpc(
    "admin_search_active_users",
    {
      p_actor_user_id: authorization.userId,
      p_event_id: eventId,
      p_query: query,
      p_limit: pageSize,
      p_cursor: cursor,
    },
  );
  if (error) {
    console.error("Administrative user search failed:", error.message);
    return Response.json({ error: "Unable to search users" }, { status: 500 });
  }
  const rows = data || [];
  return Response.json(
    {
      data: rows.slice(0, pageSize),
      nextCursor: rows.length > pageSize ? rows[pageSize - 1]?.id : null,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
