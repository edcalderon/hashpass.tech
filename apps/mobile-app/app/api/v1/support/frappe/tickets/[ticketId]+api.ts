import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { frappeTicketIdFromRequest, loadAuthorizedTicket } from "@/lib/server/support-route-params";
import {
  addHelpdeskTicketComment,
  closeHelpdeskTicket,
  FrappeHelpdeskConfigError,
  FrappeHelpdeskRequestError,
  isAllowedAttachmentType,
  listHelpdeskTicketComments,
  MAX_ATTACHMENT_BYTES,
  uploadHelpdeskAttachment,
} from "@/lib/server/frappe-helpdesk";

// Escaping is the whole defense here -- the file name comes from whatever
// the visitor's device/browser reported for the picked file, so it's
// untrusted input that ends up inside HTML content re-rendered by
// lib/support/render-html-content.tsx (which never uses
// dangerouslySetInnerHTML, but this content is also visible to Frappe staff
// in the real Helpdesk UI, which does render raw HTML).
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
// Also handles a file attachment: a multipart/form-data body (email + file)
// takes the attachment branch below instead of the plain-text JSON one; both
// end up as a normal HD Ticket Comment, so the client's message list and
// polling need no separate code path for either.
export async function POST(request: Request) {
  const ticketId = frappeTicketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-frappe-ticket-reply:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return handleAttachmentUpload(request, ticketId);
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

// This repo has multiple ambient FormData declarations in scope (DOM lib,
// @types/node's undici-backed fetch globals, @types/react's empty RN stub),
// and their merge doesn't reliably expose .get() through Request["formData"]'s
// inferred return type -- so the multipart body is read through this narrow,
// locally-owned shape instead of fighting that global merge.
interface MultipartFormData {
  get(key: string): unknown;
}

async function handleAttachmentUpload(request: Request, ticketId: string): Promise<Response> {
  let form: MultipartFormData;
  try {
    form = (await request.formData()) as unknown as MultipartFormData;
  } catch {
    return Response.json({ message: "Invalid upload" }, { status: 400 });
  }

  const email = String(form.get("email") || "").trim();
  const file = form.get("file");
  if (!email) return Response.json({ message: "email is required" }, { status: 400 });
  if (!(file instanceof Blob) || !file.size) {
    return Response.json({ message: "A file is required" }, { status: 400 });
  }
  if (!rateLimitOk(`support-frappe-ticket-reply:${email.toLowerCase()}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Response.json({ message: "File is too large (10MB max)" }, { status: 413 });
  }
  const declaredType = "type" in file ? String((file as File).type || "") : "";
  if (!declaredType || !isAllowedAttachmentType(declaredType)) {
    return Response.json({ message: "Only images and PDF files can be attached" }, { status: 415 });
  }

  const rawName = "name" in file ? String((file as File).name || "attachment") : "attachment";
  // Strip any path component a picker might report and cap length -- this
  // name is only ever used as a display label and Frappe's own file name,
  // never as a filesystem path on our side.
  const fileName = (rawName.split(/[\\/]/).pop() || "attachment").slice(0, 200);

  try {
    const { ticket, response } = await loadAuthorizedTicket(ticketId, email);
    if (response) return response;

    const uploaded = await uploadHelpdeskAttachment(ticket.id, { data: file, fileName });
    const content = `<p>📎 <a href="hashpass-attachment://${uploaded.fileId}">${escapeHtml(uploaded.fileName)}</a></p>`;
    const comment = await addHelpdeskTicketComment(ticket.id, content);
    return Response.json({ message: comment }, { status: 201 });
  } catch (err) {
    return frappeErrorResponse("support/frappe/tickets/:id POST (attachment)", err);
  }
}

// "Cancel ticket" -- closes the ticket in Frappe. There is no delete
// capability for a visitor (see closeHelpdeskTicket's own comment); this is
// the honest equivalent the app exposes.
export async function PATCH(request: Request) {
  const ticketId = frappeTicketIdFromRequest(request);
  if (!ticketId) return Response.json({ message: "Invalid ticket id" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-frappe-ticket-close:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return Response.json({ message: "email is required" }, { status: 400 });

  try {
    const { ticket, response } = await loadAuthorizedTicket(ticketId, email);
    if (response) return response;

    const updated = await closeHelpdeskTicket(ticket.id);
    return Response.json({ ticket: updated }, { status: 200 });
  } catch (err) {
    return frappeErrorResponse("support/frappe/tickets/:id PATCH", err);
  }
}
