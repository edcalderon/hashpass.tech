import { rateLimitOk } from "@/lib/bsl/rateLimit";
import {
  createHelpdeskTicket,
  FrappeHelpdeskConfigError,
  FrappeHelpdeskRequestError,
} from "@/lib/server/frappe-helpdesk";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Creates a real Frappe HD Ticket for the in-app "Contact Support" flow (see
// app/(shared)/support.tsx). This Frappe Helpdesk instance is staff/agent-only
// -- no public guest portal or live-chat widget -- so this route is the only
// way an app user reaches it, and there is no session/visitor system for
// this path (unlike the Supabase-backed widget at
// app/api/v1/support/tickets+api.ts). Access to a ticket after creation is
// therefore gated on "ticket id + the same email used to raise it" (see the
// [ticketId] route below) -- a deliberately lightweight, non-cryptographic
// check, the same trust level as most "track my order by email" flows. This
// is a documented tradeoff, not a silent gap.
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-frappe-ticket-create:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  // Free-text app/platform context (event, screen, app version) appended to
  // the ticket description for traceability -- HD Ticket has no custom
  // fields for this, and we deliberately didn't ask Frappe ops to add any.
  const context = typeof body?.context === "string" ? body.context.trim() : "";

  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ message: "A valid email is required" }, { status: 400 });
  }
  if (!subject || !message) {
    return Response.json({ message: "subject and message are required" }, { status: 400 });
  }
  if (!rateLimitOk(`support-frappe-ticket-create:${email.toLowerCase()}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  const description = context ? `${message}\n\n---\n${context}` : message;

  try {
    const ticket = await createHelpdeskTicket({ subject, raisedBy: email, description });
    return Response.json({ ticket }, { status: 201 });
  } catch (err) {
    if (err instanceof FrappeHelpdeskConfigError) {
      console.error("[support/frappe/tickets] configuration error:", err.message);
      return Response.json({ message: "Support is not configured" }, { status: 500 });
    }
    if (err instanceof FrappeHelpdeskRequestError) {
      console.error("[support/frappe/tickets] Frappe request failed:", err.status, err.message);
      return Response.json({ message: "Unable to create ticket right now" }, { status: 502 });
    }
    console.error("[support/frappe/tickets] unexpected error:", err);
    return Response.json({ message: "Unable to create ticket right now" }, { status: 500 });
  }
}
