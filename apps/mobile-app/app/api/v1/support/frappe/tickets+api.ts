import { rateLimitOk } from "@/lib/bsl/rateLimit";
import cap from "@/lib/cap-instance";
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
//
// hashpass.tech/support is a public page reachable without signing in (see
// app/_layout.tsx's isPublicPage), by design -- someone locked out of their
// account still needs to be able to reach support. That also makes this
// route the abuse surface for scripted spam, so web submissions are gated on
// a solved Cap proof-of-work challenge (see SupportCaptcha.web.tsx), the same
// `source: 'native' || !captchaToken` convention app/api/subscribe+api.ts
// already uses: the native app has no captcha solver (Cap's widget is a
// browser-only custom element -- see packages/ui/src/CaptchaWidget.tsx), so
// native calls stay ungated and rely on IP + email rate limiting instead.
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
  const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken.trim() : "";
  const isNative = body?.source === "native" || !captchaToken;

  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ message: "A valid email is required" }, { status: 400 });
  }
  if (!subject || !message) {
    return Response.json({ message: "subject and message are required" }, { status: 400 });
  }
  if (!rateLimitOk(`support-frappe-ticket-create:${email.toLowerCase()}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  if (!isNative) {
    let captchaValid = false;
    try {
      captchaValid = (await cap.validateToken(captchaToken)).success;
    } catch (err) {
      console.error("[support/frappe/tickets] captcha validateToken threw:", err);
      captchaValid = false;
    }
    if (!captchaValid) {
      return Response.json(
        { message: "Security check expired. Please try again.", captchaExpired: true },
        { status: 400 },
      );
    }
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
