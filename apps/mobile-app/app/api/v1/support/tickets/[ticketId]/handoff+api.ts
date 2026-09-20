import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { sendCriticalNotificationEmail } from "@/lib/email";
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

  return withIdempotency(supabase, request, session.appId, `tickets:${ticketId}:handoff`, async () => {
    const { data, error } = await supabase.rpc("request_ticket_handoff", {
      p_ticket_id: ticketId,
      p_visitor_id: session.visitorId,
    });

    if (error || !data?.[0]) {
      const notFound = error?.message?.includes("not found");
      console.error("[support/tickets/:id/handoff] failed:", error?.message);
      return { status: notFound ? 404 : 500, body: { message: notFound ? "Ticket not found" : "Unable to request handoff" } };
    }

    const ticket = data[0];
    const recipientEmail = process.env.SUPPORT_ADMIN_NOTIFICATION_EMAIL;
    if (recipientEmail) {
      try {
        await sendCriticalNotificationEmail({
          recipientEmail,
          title: `Human requested on ticket (${session.appId}): ${ticket.subject}`,
          message: "A visitor asked to speak with a human on this ticket.",
          notificationType: "support_handoff_requested",
          actionUrl: `https://hashpass.tech/admin/support/tickets/${ticket.id}`,
          actionLabel: "View ticket",
        });
      } catch (err) {
        console.warn("[support/tickets/:id/handoff] admin notification failed:", err);
      }
    }

    return { status: 200, body: serializeSupportTicket(ticket) };
  });
}
