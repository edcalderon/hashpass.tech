import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { frappeTicketIdFromRequest } from "@/lib/server/support-route-params";
import {
  addHelpdeskTicketComment,
  FrappeHelpdeskConfigError,
  FrappeHelpdeskRequestError,
  getHelpdeskTicket,
  listHelpdeskTicketComments,
} from "@/lib/server/frappe-helpdesk";
import type { FrappeHelpdeskTicket } from "@/lib/server/frappe-helpdesk";

// See tickets+api.ts's POST handler for why this route's access control is
// "ticket id + the email that raised it" rather than a real session -- this
// Frappe instance has no public/guest auth of its own for the app to piggy-back on.
async function loadAuthorizedTicket(
  ticketId: string,
  email: string,
): Promise<{ ticket: FrappeHelpdeskTicket; response: null } | { ticket: null; response: Response }> {
  const ticket = await getHelpdeskTicket(ticketId);
  const notFound = { ticket: null, response: Response.json({ message: "Ticket not found" }, { status: 404 }) } as const;
  if (!ticket) return notFound;
  if (ticket.raisedBy.trim().toLowerCase() !== email.trim().toLowerCase()) return notFound;
  return { ticket, response: null };
}

function frappeErrorResponse(scope: string, err: unknown): Response {
  if (err instanceof FrappeHelpdeskConfigError) {
    console.error(`[${scope}] configuration error:`, err.message);
    return Response.json({ message: "Support is not configured" }, { status: 500 });
  }
  if (err instanceof FrappeHelpdeskRequestError) {
    console.error(`[${scope}] Frappe request failed:`, err.status, err.message);
    return Response.json({ message: "Unable to reach support right now" }, { status: 502 });
  }
  console.error(`[${scope}] unexpected error:`, err);
  return Response.json({ message: "Unable to reach support right now" }, { status: 500 });
}

// Polled by the live-chat view (see app/(shared)/support.tsx) to refresh the
// ticket status and message thread. No push/websocket transport exists for
// this Frappe-direct path, so the client re-fetches on an interval.
export async function GET(request: Request) {
  const ticketId = frappeTicketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim();
  if (!email) return Response.json({ message: "email is required" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-frappe-ticket-read:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  try {
    const { ticket, response } = await loadAuthorizedTicket(ticketId, email);
    if (response) return response;

    const messages = await listHelpdeskTicketComments(ticket.id);
    return Response.json({ ticket, messages }, { status: 200 });
  } catch (err) {
    return frappeErrorResponse("support/frappe/tickets/:id GET", err);
  }
}

// Sends a visitor reply on an existing ticket -- the "live chat" send action.
export async function POST(request: Request) {
  const ticketId = frappeTicketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-frappe-ticket-reply:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!email) return Response.json({ message: "email is required" }, { status: 400 });
  if (!content) return Response.json({ message: "content is required" }, { status: 400 });
  if (!rateLimitOk(`support-frappe-ticket-reply:${email.toLowerCase()}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  try {
    const { ticket, response } = await loadAuthorizedTicket(ticketId, email);
    if (response) return response;

    const comment = await addHelpdeskTicketComment(ticket.id, content);
    return Response.json({ message: comment }, { status: 201 });
  } catch (err) {
    return frappeErrorResponse("support/frappe/tickets/:id POST", err);
  }
}
