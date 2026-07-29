const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;

/**
 * Reads the event identity from a shared event API route.
 *
 * Event identity is intentionally accepted only from `/api/events/:eventId`.
 * Query strings and request bodies are untrusted feature input and must never
 * select a different event than the route being served.
 */
export function eventIdFromRequest(request: Request): string | null {
  const pathSegments = new URL(request.url).pathname.split("/").filter(Boolean);
  const eventsIndex = pathSegments.indexOf("events");
  const eventId = eventsIndex >= 0 ? pathSegments[eventsIndex + 1] : undefined;

  return eventId && EVENT_ID_PATTERN.test(eventId) ? eventId.toLowerCase() : null;
}
