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
