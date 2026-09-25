import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { withIdempotency } from "@/lib/server/support-idempotency";
import { resolveSupportSession, unauthorizedSupportResponse } from "@/lib/server/support-session";
import { ticketIdFromRequest } from "@/lib/server/support-route-params";
import { serializeSupportMessage } from "@/lib/server/support-serializers";

export async function GET(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 30;

  const { data, error } = await supabase.rpc("list_support_messages", {
    p_ticket_id: ticketId,
    p_visitor_id: session.visitorId,
    p_cursor: cursor || null,
    p_limit: limit + 1,
  });

  if (error) {
    const notFound = error.message?.includes("not found");
    if (!notFound) console.error("[support/tickets/:id/messages] list failed:", error.message);
    return Response.json({ message: notFound ? "Ticket not found" : "Unable to list messages" }, { status: notFound ? 404 : 500 });
  }

  const rows: Record<string, unknown>[] = data ?? [];
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? (page[page.length - 1]?.id as string | undefined) : undefined;

  return Response.json({ items: page.map(serializeSupportMessage), nextCursor }, { status: 200 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-message-send:${ip}`) || !rateLimitOk(`support-message-send:${session.visitorId}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  return withIdempotency(supabase, request, session.appId, `tickets:${ticketId}:messages:create`, async () => {
    const body = await request.json().catch(() => ({}));
    const messageBody = typeof body?.body === "string" ? body.body : "";
    if (!messageBody.trim()) return { status: 400, body: { message: "body is required" } };

    const { data, error } = await supabase.rpc("send_support_message", {
      p_ticket_id: ticketId,
      p_visitor_id: session.visitorId,
      p_body: messageBody,
    });

    if (error || !data?.[0]) {
      const notFound = error?.message?.includes("not found");
      console.error("[support/tickets/:id/messages] send failed:", error?.message);
      return { status: notFound ? 404 : 500, body: { message: notFound ? "Ticket not found" : "Unable to send message" } };
    }

    return { status: 201, body: serializeSupportMessage(data[0]) };
  });
}
