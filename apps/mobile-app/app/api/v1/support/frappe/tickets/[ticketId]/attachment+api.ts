import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { frappeTicketIdFromRequest, loadAuthorizedTicket } from "@/lib/server/support-route-params";
import {
  fetchHelpdeskAttachment,
  FrappeHelpdeskConfigError,
  FrappeHelpdeskRequestError,
} from "@/lib/server/frappe-helpdesk";

// Secure download proxy for an attachment uploaded via the sibling
// tickets/[ticketId]+api.ts POST (multipart) handler. The client never gets
// a direct Frappe file URL (those files are uploaded is_private:1 and
// require our service credentials to read) -- it only ever holds an opaque
// fileId embedded in the message content it already received, and re-proves
// ticket ownership (ticket id + email) on every download, same as the
// GET/POST/PATCH routes in the sibling file.
export async function GET(request: Request) {
  const ticketId = frappeTicketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim();
  const fileId = (searchParams.get("file") || "").trim();
  if (!email) return Response.json({ message: "email is required" }, { status: 400 });
  if (!fileId) return Response.json({ message: "file is required" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-frappe-attachment-read:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  try {
    const { ticket, response } = await loadAuthorizedTicket(ticketId, email);
    if (response) return response;

    const attachment = await fetchHelpdeskAttachment(ticket.id, fileId);
    return new Response(attachment.body, {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof FrappeHelpdeskConfigError) {
      console.error("[support/frappe/tickets/:id/attachment GET] configuration error:", err.message);
      return Response.json({ message: "Support is not configured" }, { status: 500 });
    }
    if (err instanceof FrappeHelpdeskRequestError) {
      console.error("[support/frappe/tickets/:id/attachment GET] Frappe request failed:", err.status, err.message);
      const status = err.status === 404 ? 404 : 502;
      return Response.json({ message: status === 404 ? "Attachment not found" : "Unable to reach support right now" }, { status });
    }
    console.error("[support/frappe/tickets/:id/attachment GET] unexpected error:", err);
    return Response.json({ message: "Unable to reach support right now" }, { status: 500 });
  }
}
