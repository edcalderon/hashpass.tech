import { authorizeGlobalAdmin } from "@/lib/server/global-admin";
import { ticketIdFromRequest } from "@/lib/server/support-route-params";
import { serializeSupportMessage, serializeSupportTicket } from "@/lib/server/support-serializers";

export async function GET(request: Request) {
  const authorization = await authorizeGlobalAdmin(request);
  if ("response" in authorization) return authorization.response;

  const ticketId = ticketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const { supabase } = authorization;
  const [{ data: ticket, error: ticketError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("*, support_visitors(id, external_id, email, name)")
      .eq("id", ticketId)
      .maybeSingle(),
    supabase.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true }),
  ]);

  if (ticketError || messagesError) {
    console.error("[admin/support/tickets/:id] fetch failed:", ticketError?.message ?? messagesError?.message);
    return Response.json({ message: "Unable to load ticket" }, { status: 500 });
  }
  if (!ticket) return Response.json({ message: "Ticket not found" }, { status: 404 });

  return Response.json(
    {
      ...serializeSupportTicket(ticket),
      appId: ticket.app_id,
      needsHuman: ticket.needs_human,
      context: ticket.context,
      visitor: ticket.support_visitors ?? null,
      messages: (messages ?? []).map(serializeSupportMessage),
    },
    { status: 200 },
  );
}
