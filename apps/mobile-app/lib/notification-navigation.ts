import { buildEventPath } from './event-path';

type EventIdCarrier = { event_id?: unknown } | null | undefined;

function eventIdFrom(carrier: EventIdCarrier): string | undefined {
  const eventId = carrier?.event_id;
  return typeof eventId === 'string' && eventId.trim() ? eventId.trim() : undefined;
}

/** Builds a notification target using its linked request's event when available. */
export function buildNotificationEventPath(
  notification: EventIdCarrier,
  meetingRequest: EventIdCarrier,
  path: string,
): string {
  return buildEventPath(eventIdFrom(meetingRequest) ?? eventIdFrom(notification), path);
}
