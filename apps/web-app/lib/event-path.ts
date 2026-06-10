import { getCurrentEvent, getRouteEventIdFromPathname } from './event-detector';

export const DEFAULT_TOUR_EVENT_ID = 'bsl';

export const resolveActiveEventId = (eventId?: string | null): string => {
  const normalizedEventId = eventId?.trim();
  if (normalizedEventId) {
    return normalizedEventId;
  }

  if (typeof window !== 'undefined') {
    const routeEventId = getRouteEventIdFromPathname(window.location.pathname);
    if (routeEventId) {
      return routeEventId;
    }
  }

  const currentEvent = getCurrentEvent();
  if (currentEvent?.eventType === 'whitelabel' && currentEvent.id) {
    return currentEvent.id;
  }

  return DEFAULT_TOUR_EVENT_ID;
};

export const buildEventPath = (eventId?: string | null, path: string = ''): string => {
  const resolvedEventId = resolveActiveEventId(eventId);
  if (!path) {
    return `/events/${resolvedEventId}`;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `/events/${resolvedEventId}${normalizedPath}`;
};
