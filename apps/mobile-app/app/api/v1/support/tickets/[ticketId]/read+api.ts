import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { withIdempotency } from "@/lib/server/support-idempotency";
import { resolveSupportSession, unauthorizedSupportResponse } from "@/lib/server/support-session";
import { ticketIdFromRequest } from "@/lib/server/support-route-params";
import { serializeSupportTicket } from "@/lib/server/support-serializers";

export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  return withIdempotency(supabase, request, session.appId, `tickets:${ticketId}:read`, async () => {
    const body = await request.json().catch(() => ({}));
    const cursor = typeof body?.cursor === "string" ? body.cursor : null;

    const { data, error } = await supabase.rpc("mark_ticket_read", {
      p_ticket_id: ticketId,
      p_visitor_id: session.visitorId,
      p_cursor: cursor,
    });

    if (error || !data?.[0]) {
      const notFound = error?.message?.includes("not found");
      console.error("[support/tickets/:id/read] failed:", error?.message);
      return { status: notFound ? 404 : 500, body: { message: notFound ? "Ticket not found" : "Unable to mark ticket read" } };
    }

    return { status: 200, body: serializeSupportTicket(data[0]) };
  });
}
