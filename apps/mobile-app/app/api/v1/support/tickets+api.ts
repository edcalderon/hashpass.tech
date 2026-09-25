import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { sendCriticalNotificationEmail } from "@/lib/email";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { withIdempotency } from "@/lib/server/support-idempotency";
import { resolveSupportSession, unauthorizedSupportResponse } from "@/lib/server/support-session";
import { serializeSupportTicket as serializeTicket } from "@/lib/server/support-serializers";

export async function GET(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const cursor = searchParams.get("cursor");
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  const { data, error } = await supabase.rpc("list_support_tickets_for_visitor", {
    p_visitor_id: session.visitorId,
    p_status: status || null,
    p_cursor: cursor || null,
    p_limit: limit + 1,
  });

  if (error) {
    console.error("[support/tickets] list_support_tickets_for_visitor failed:", error.message);
    return Response.json({ message: "Unable to list tickets" }, { status: 500 });
  }

  const rows: Record<string, unknown>[] = data ?? [];
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? (page[page.length - 1]?.id as string | undefined) : undefined;

  return Response.json({ items: page.map(serializeTicket), nextCursor }, { status: 200 });
}

// Anonymous by contract (see packages/sdk/src/support/client.ts's createTicket),
// but requires a support session -- the widget always calls
// createSupportSession() on boot first (see packages/support-widget/src/index.ts),
// so "anonymous" means "no login", not "no session token".
//
// Deliberately does NOT gate on Cap captcha here: CreateTicketInput
// (packages/sdk/src/support/types.ts) has no captcha field and the widget
// has no challenge-solving UI, so wiring Cap in would mean growing the SDK
// contract and widget UI beyond what this pass covers. Abuse mitigation for
// this release is IP + per-visitor rate limiting only -- a real gap, called
// out in docs/support/architecture.md, not a silent omission.
export async function POST(request: Request) {
  const supabase = getSupabaseServerForRequest(request);
  const session = await resolveSupportSession(supabase, request);
  if (!session) return unauthorizedSupportResponse();

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-ticket-create:${ip}`) || !rateLimitOk(`support-ticket-create:${session.visitorId}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  return withIdempotency(supabase, request, session.appId, "tickets:create", async () => {
    const body = await request.json().catch(() => ({}));
    const subject = typeof body?.subject === "string" ? body.subject : "";
    const message = typeof body?.message === "string" ? body.message : "";
    const priority = typeof body?.priority === "string" ? body.priority : "normal";
    const context = body?.context && typeof body.context === "object" ? body.context : null;

    if (!subject.trim() || !message.trim()) {
      return { status: 400, body: { message: "subject and message are required" } };
    }

    const { data, error } = await supabase.rpc("create_support_ticket", {
      p_app_id: session.appId,
      p_visitor_id: session.visitorId,
      p_subject: subject,
      p_message: message,
      p_priority: priority,
      p_context: context,
    });

    if (error || !data?.[0]) {
      console.error("[support/tickets] create_support_ticket failed:", error?.message);
      const status = error?.message?.includes("required") || error?.message?.includes("Invalid priority") ? 400 : 500;
      return { status, body: { message: status === 400 ? error!.message : "Unable to create ticket" } };
    }

    // Awaited deliberately: the Lambda runtime can freeze the container right
    // after the response is returned, so a fire-and-forget email here could
    // simply never send (see the same pattern in
    // apps/mobile-app/app/api/events/[eventId]/meetings/requests+api.ts).
    try {
      await notifySupportTeamOfNewTicket(session.appId, data[0]);
    } catch (err) {
      console.warn("[support/tickets] admin notification failed:", err);
    }

    return { status: 201, body: serializeTicket(data[0]) };
  });
}

async function notifySupportTeamOfNewTicket(appId: string, ticket: Record<string, unknown>): Promise<void> {
  const recipientEmail = process.env.SUPPORT_ADMIN_NOTIFICATION_EMAIL;
  if (!recipientEmail) return;

  await sendCriticalNotificationEmail({
    recipientEmail,
    title: `New support ticket (${appId}): ${ticket.subject}`,
    message: `A new ${ticket.priority} priority support ticket was opened.`,
    notificationType: "support_ticket_created",
    actionUrl: `https://hashpass.tech/admin/support/tickets/${ticket.id}`,
    actionLabel: "View ticket",
  });
}
