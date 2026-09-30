/**
 * Minimal server-side Frappe Helpdesk REST client for the app's own
 * "Contact Support" flow (open a ticket / live chat -- see
 * app/(shared)/support.tsx and app/api/v1/support/frappe/**).
 *
 * Deliberately independent from packages/frappe-helpdesk-mcp's
 * FrappeHelpdeskClient: that package is a narrow, agent-facing stdio MCP
 * server with its own env vars (FRAPPE_MCP_READ_API_KEY etc) and is
 * explicitly not meant to be imported by app backends (see its README --
 * "Run separate MCP processes for read and write clients", credentials must
 * never be placed in MCP client JSON). This module uses its own dedicated
 * FRAPPE_SUPPORT_* service-user credentials (see .env.example) so the two
 * integrations never share a credential or a code path.
 *
 * Auth uses Frappe's standard API key/secret scheme:
 * `Authorization: token <key>:<secret>`. Only standard HD Ticket / HD Ticket
 * Comment fields are read or written -- no custom Frappe fields required.
 */

export class FrappeHelpdeskConfigError extends Error {}

export class FrappeHelpdeskRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface FrappeCredentials {
  baseUrl: string;
  readToken: string | null;
  writeToken: string | null;
  team: string;
}

function readCredentials(): FrappeCredentials {
  const baseUrl = (process.env.FRAPPE_BASE_URL || "").trim().replace(/\/$/, "");
  if (!baseUrl) throw new FrappeHelpdeskConfigError("FRAPPE_BASE_URL is not configured");

  const readKey = process.env.FRAPPE_SUPPORT_READ_API_KEY;
  const readSecret = process.env.FRAPPE_SUPPORT_READ_API_SECRET;
  const writeKey = process.env.FRAPPE_SUPPORT_WRITE_API_KEY;
  const writeSecret = process.env.FRAPPE_SUPPORT_WRITE_API_SECRET;

  return {
    baseUrl,
    readToken: readKey && readSecret ? `token ${readKey}:${readSecret}` : null,
    writeToken: writeKey && writeSecret ? `token ${writeKey}:${writeSecret}` : null,
    // agent_group / HD Team new tickets are routed to. Defaults to
    // "HASHPASS" -- see the .env.example TODO to confirm the real team name
    // with ops before relying on this in production.
    team: (process.env.FRAPPE_SUPPORT_TEAM || "HASHPASS").trim() || "HASHPASS",
  };
}

async function request<T>(
  path: string,
  {
    query,
    body,
    method = "GET",
    write = false,
  }: { query?: Record<string, unknown>; body?: unknown; method?: string; write?: boolean } = {},
): Promise<T> {
  const creds = readCredentials();
  const token = write ? creds.writeToken : creds.readToken;
  if (!token) {
    throw new FrappeHelpdeskConfigError(
      write
        ? "FRAPPE_SUPPORT_WRITE_API_KEY/FRAPPE_SUPPORT_WRITE_API_SECRET is not configured"
        : "FRAPPE_SUPPORT_READ_API_KEY/FRAPPE_SUPPORT_READ_API_SECRET is not configured",
    );
  }

  const url = new URL(`/api/${path.replace(/^\//, "")}`, `${creds.baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { Authorization: token, Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new FrappeHelpdeskRequestError(
      err instanceof Error ? err.message : "Frappe Helpdesk request failed",
      502,
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message ?? payload?.exception ?? `Frappe Helpdesk returned ${response.status}`;
    throw new FrappeHelpdeskRequestError(String(message), response.status);
  }
  return (payload?.data ?? payload?.message ?? payload) as T;
}

export interface FrappeHelpdeskTicket {
  id: string; // Frappe "name" (doctype primary key) -- a naming-series string, not a uuid.
  subject: string;
  status: string;
  priority: string;
  raisedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FrappeHelpdeskComment {
  id: string;
  content: string;
  commentedBy: string | null;
  createdAt: string;
}

function serializeTicket(raw: Record<string, unknown>): FrappeHelpdeskTicket {
  return {
    id: String(raw.name ?? ""),
    subject: String(raw.subject ?? ""),
    status: String(raw.status ?? "Open"),
    priority: String(raw.priority ?? "Medium"),
    raisedBy: String(raw.raised_by ?? ""),
    createdAt: String(raw.creation ?? ""),
    updatedAt: String(raw.modified ?? raw.creation ?? ""),
  };
}

function serializeComment(raw: Record<string, unknown>): FrappeHelpdeskComment {
  return {
    id: String(raw.name ?? ""),
    content: String(raw.content ?? ""),
    commentedBy: raw.commented_by ? String(raw.commented_by) : null,
    createdAt: String(raw.creation ?? ""),
  };
}

export async function createHelpdeskTicket(input: {
  subject: string;
  raisedBy: string;
  description: string;
  priority?: "Low" | "Medium" | "High" | "Urgent";
}): Promise<FrappeHelpdeskTicket> {
  const creds = readCredentials();
  const raw = await request<Record<string, unknown>>("resource/HD Ticket", {
    method: "POST",
    write: true,
    body: {
      subject: input.subject,
      raised_by: input.raisedBy,
      description: input.description,
      agent_group: creds.team,
      priority: input.priority || "Medium",
    },
  });
  return serializeTicket(raw);
}

export async function getHelpdeskTicket(ticketId: string): Promise<FrappeHelpdeskTicket | null> {
  try {
    const raw = await request<Record<string, unknown>>(`resource/HD Ticket/${encodeURIComponent(ticketId)}`);
    return serializeTicket(raw);
  } catch (err) {
    if (err instanceof FrappeHelpdeskRequestError && err.status === 404) return null;
    throw err;
  }
}

export async function listHelpdeskTicketComments(ticketId: string): Promise<FrappeHelpdeskComment[]> {
  const raw = await request<Record<string, unknown>[]>("resource/HD Ticket Comment", {
    query: {
      fields: ["name", "content", "commented_by", "creation"],
      filters: [["HD Ticket Comment", "reference_ticket", "=", ticketId]],
      order_by: "creation asc",
      limit_page_length: 200,
    },
  });
  return (raw ?? []).map(serializeComment);
}

export async function addHelpdeskTicketComment(ticketId: string, content: string): Promise<FrappeHelpdeskComment> {
  const raw = await request<Record<string, unknown>>("resource/HD Ticket Comment", {
    method: "POST",
    write: true,
    body: { reference_ticket: ticketId, content },
  });
  return serializeComment(raw);
}

// "Cancel ticket" in the app maps to Frappe's standard Closed status -- HD
// Ticket has no delete-by-visitor capability (nor should it; that would
// destroy real support history), so this is the closest honest equivalent.
export async function closeHelpdeskTicket(ticketId: string): Promise<FrappeHelpdeskTicket> {
  const raw = await request<Record<string, unknown>>(`resource/HD Ticket/${encodeURIComponent(ticketId)}`, {
    method: "PUT",
    write: true,
    body: { status: "Closed" },
  });
  return serializeTicket(raw);
}

export interface FrappeHelpdeskAttachment {
  fileId: string;
  fileName: string;
}

const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

export function isAllowedAttachmentType(contentType: string): boolean {
  return ALLOWED_ATTACHMENT_TYPES.has(contentType.toLowerCase());
}

// Uploads a file attached directly to the HD Ticket doctype (not to a
// specific comment -- HD Ticket Comment has no first-class attachment field
// exposed over the REST API), as a private Frappe file. "Private" here means
// Frappe requires an authenticated request (our own service credentials) to
// read it back -- never a bare public URL -- which is why every download
// goes through fetchHelpdeskAttachment below instead of returning file_url
// to the client directly.
export async function uploadHelpdeskAttachment(
  ticketId: string,
  file: { data: Blob; fileName: string },
): Promise<FrappeHelpdeskAttachment> {
  const creds = readCredentials();
  if (!creds.writeToken) {
    throw new FrappeHelpdeskConfigError(
      "FRAPPE_SUPPORT_WRITE_API_KEY/FRAPPE_SUPPORT_WRITE_API_SECRET is not configured",
    );
  }

  const form = new FormData();
  form.append("is_private", "1");
  form.append("doctype", "HD Ticket");
  form.append("docname", ticketId);
  form.append("file", file.data, file.fileName);

  const url = new URL("/api/method/upload_file", `${creds.baseUrl}/`);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: creds.writeToken },
      body: form,
    });
  } catch (err) {
    throw new FrappeHelpdeskRequestError(
      err instanceof Error ? err.message : "Frappe Helpdesk upload failed",
      502,
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message ?? payload?.exception ?? `Frappe Helpdesk returned ${response.status}`;
    throw new FrappeHelpdeskRequestError(String(message), response.status);
  }
  const data = (payload?.message ?? payload?.data ?? payload) as Record<string, unknown>;
  return {
    fileId: String(data?.name ?? ""),
    fileName: String(data?.file_name ?? file.fileName),
  };
}

// Re-verifies the File doc is actually attached to this ticket before ever
// touching its bytes -- a client-supplied fileId that doesn't belong to this
// ticket (guessed, or from a different ticket the same visitor also owns)
// is rejected here rather than trusted, even though the caller already
// passed the ticket id + email ownership check.
export async function fetchHelpdeskAttachment(
  ticketId: string,
  fileId: string,
): Promise<{ body: ArrayBuffer; contentType: string; fileName: string }> {
  const creds = readCredentials();
  if (!creds.readToken) {
    throw new FrappeHelpdeskConfigError("FRAPPE_SUPPORT_READ_API_KEY/FRAPPE_SUPPORT_READ_API_SECRET is not configured");
  }

  const fileDoc = await request<Record<string, unknown>>(`resource/File/${encodeURIComponent(fileId)}`);
  const attachedDoctype = String(fileDoc?.attached_to_doctype ?? "");
  const attachedName = String(fileDoc?.attached_to_name ?? "");
  const fileUrl = String(fileDoc?.file_url ?? "");
  if (attachedDoctype !== "HD Ticket" || attachedName !== ticketId || !fileUrl) {
    throw new FrappeHelpdeskRequestError("Attachment not found on this ticket", 404);
  }

  const downloadUrl = new URL(fileUrl.replace(/^\//, ""), `${creds.baseUrl}/`);
  let response: Response;
  try {
    response = await fetch(downloadUrl, { headers: { Authorization: creds.readToken } });
  } catch (err) {
    throw new FrappeHelpdeskRequestError(
      err instanceof Error ? err.message : "Frappe Helpdesk attachment download failed",
      502,
    );
  }
  if (!response.ok) {
    throw new FrappeHelpdeskRequestError(`Frappe Helpdesk returned ${response.status}`, response.status);
  }

  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    fileName: String(fileDoc?.file_name ?? "attachment"),
  };
}
