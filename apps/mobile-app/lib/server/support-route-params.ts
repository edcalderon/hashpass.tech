// Expo Router API routes here don't receive a params object (see
// apps/mobile-app/lib/server/event-api.ts's eventIdFromRequest for the same
// pattern) -- dynamic segments are parsed back out of the request URL.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ticketIdFromRequest(request: Request): string | null {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const ticketsIndex = segments.indexOf("tickets");
  const ticketId = ticketsIndex >= 0 ? segments[ticketsIndex + 1] : undefined;
  return ticketId && UUID_PATTERN.test(ticketId) ? ticketId : null;
}

// Frappe HD Ticket's "name" is that doctype's own naming-series value (an
// integer string, or a series like "HD-TICKET-00001" depending on site
// config) -- not a uuid, so it needs its own, more permissive pattern than
// ticketIdFromRequest above (which is specific to this app's own Supabase
// support_tickets.id). See lib/server/frappe-helpdesk.ts.
const FRAPPE_TICKET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function frappeTicketIdFromRequest(request: Request): string | null {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const ticketsIndex = segments.indexOf("tickets");
  const ticketId = ticketsIndex >= 0 ? segments[ticketsIndex + 1] : undefined;
  return ticketId && FRAPPE_TICKET_ID_PATTERN.test(ticketId) ? ticketId : null;
}
