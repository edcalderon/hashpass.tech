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
