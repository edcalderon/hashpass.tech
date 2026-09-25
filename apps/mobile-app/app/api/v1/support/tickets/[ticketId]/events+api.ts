import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { resolveSupportSession, unauthorizedSupportResponse } from "@/lib/server/support-session";
import { ticketIdFromRequest } from "@/lib/server/support-route-params";

// Backs SupportClient.watchTicket's cursor-poll loop (packages/sdk/src/support/client.ts).
// agent.joined/typing.* are never emitted here -- see list_support_events'
// header comment in db/migrations/V065__support_system.sql for why.
export async function GET(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");

  const { data, error } = await supabase.rpc("list_support_events", {
    p_ticket_id: ticketId,
    p_visitor_id: session.visitorId,
    p_cursor: cursor || null,
    p_limit: 50,
  });

  if (error) {
    const notFound = error.message?.includes("not found");
    if (!notFound) console.error("[support/tickets/:id/events] list failed:", error.message);
    return Response.json({ message: notFound ? "Ticket not found" : "Unable to list events" }, { status: notFound ? 404 : 500 });
  }

  // SupportEvent (packages/sdk/src/support/types.ts) nests the row under
  // `ticket`/`message`, it does not flatten those fields onto the event --
  // { type: "ticket.updated", cursor, ticket: SupportTicket } vs
  // { type: "message.created", cursor, message: SupportMessage }.
  const rows: Array<{ cursor: string; event_type: string; payload: Record<string, unknown> }> = data ?? [];
  const items = rows.map((row) =>
    row.event_type === "message.created"
      ? { type: "message.created" as const, cursor: row.cursor, message: row.payload }
      : { type: "ticket.updated" as const, cursor: row.cursor, ticket: row.payload },
  );
  const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.cursor : undefined;

  return Response.json({ items, nextCursor }, { status: 200 });
}
