import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { resolveSupportSession, unauthorizedSupportResponse } from "@/lib/server/support-session";
import { ticketIdFromRequest } from "@/lib/server/support-route-params";
import { serializeSupportTicket as serializeTicket } from "@/lib/server/support-serializers";

export async function GET(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("visitor_id", session.visitorId)
    .maybeSingle();

  if (error) {
    console.error("[support/tickets/:id] fetch failed:", error.message);
    return Response.json({ message: "Unable to load ticket" }, { status: 500 });
  }
  if (!data) return Response.json({ message: "Ticket not found" }, { status: 404 });

  return Response.json(serializeTicket(data), { status: 200 });
}

// Matches SupportClient.reopenTicket/resolveTicket (packages/sdk/src/support/client.ts),
// both of which PATCH { status: 'open' | 'resolved' } -- no other field is
// publicly mutable through this endpoint.
export async function PATCH(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const status = body?.status;
  if (status !== "open" && status !== "resolved") {
    return Response.json({ message: "status must be 'open' or 'resolved'" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("set_ticket_status", {
    p_ticket_id: ticketId,
    p_visitor_id: session.visitorId,
    p_status: status,
  });

  if (error) {
    const notFound = error.message?.includes("not found");
    console.error("[support/tickets/:id] set_ticket_status failed:", error.message);
    return Response.json({ message: notFound ? "Ticket not found" : "Unable to update ticket" }, { status: notFound ? 404 : 500 });
  }
  if (!data?.[0]) return Response.json({ message: "Ticket not found" }, { status: 404 });

  return Response.json(serializeTicket(data[0]), { status: 200 });
}
