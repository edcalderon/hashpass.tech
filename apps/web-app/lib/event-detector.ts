// Event Detection Utility
// This utility detects available events based on the current deployment context

import { EventConfig, EVENTS } from '../config/events';
import { ENV_CONFIG } from '@hashpass/config';

// EventInfo is the UI-focused view of EventConfig
// It omits backend-specific fields (name, domain) and adds availability flag
export interface EventInfo extends Omit<EventConfig, 'name' | 'domain'> {
  available: boolean;
}

export type EventTenantSource = 'env-event-ids' | 'env-tenant' | 'config' | 'default';

export interface EventTenantContext {
  id: string;
  source: EventTenantSource;
  hostname: string;
  eventIds: string[] | null;
  showAllEvents: boolean;
}

const MAIN_EVENT_TENANT_ID = 'main';

const TENANT_ALIASES: Record<string, string> = {
  all: 'main',
  core: 'main',
  default: 'main',
  hashpass: 'main',
  hs: 'main',
  main: 'main',
  blockchain: 'bsl',
  'blockchain-summit': 'bsl',
  blockchainsummit: 'bsl',
  'bsl-on-tour': 'bsl',
  'bsl-ontour': 'bsl',
  bsl: 'bsl',
  bslatam: 'bsl',
  ontour: 'bsl',
  'bsl-2025': 'bsl2025',
  bsl2025: 'bsl2025',
};

const getEventTourHubId = (eventId: string): string | null => {
  const event = EVENTS[eventId];
  if (!event) return null;
  if (event.tour?.role === 'hub') return event.id;
  return event.tour?.hubEventId || null;
};

const compareEventInfos = (a: EventInfo, b: EventInfo): number => {
  const roleOrder = (event: EventInfo): number => {
    if (event.tour?.role === 'hub') return 0;
    if (event.tour?.role === 'stop') return 1;
    if (event.tour?.role === 'archive') return 2;
    return 3;
  };

  const aRole = roleOrder(a);
  const bRole = roleOrder(b);
  if (aRole !== bRole) return aRole - bRole;

  const aStop = typeof a.tour?.stopOrder === 'number' ? a.tour.stopOrder : Number.MAX_SAFE_INTEGER;
  const bStop = typeof b.tour?.stopOrder === 'number' ? b.tour.stopOrder : Number.MAX_SAFE_INTEGER;
  if (aStop !== bStop) return aStop - bStop;

  const aDate = a.eventStartDate ? new Date(a.eventStartDate).getTime() : Number.MAX_SAFE_INTEGER;
  const bDate = b.eventStartDate ? new Date(b.eventStartDate).getTime() : Number.MAX_SAFE_INTEGER;
  if (aDate !== bDate) return aDate - bDate;

  return a.title.localeCompare(b.title);
};

const sortEventInfos = (events: EventInfo[]): EventInfo[] => {
  return [...events].sort(compareEventInfos);
};

const getEventTourFamilyIds = (hubEventId: string): string[] => {
  const family = Object.values(EVENTS)
    .filter(event => event.eventType === 'whitelabel' && (event.id === hubEventId || event.tour?.hubEventId === hubEventId))
    .map(event => configToEventInfo(event, true));

  return sortEventInfos(family).map(event => event.id);
};

// Helper function to convert EventConfig to EventInfo
const configToEventInfo = (config: EventConfig, available: boolean): EventInfo => {
  const { name, domain, ...rest } = config;
  return {
    ...rest,
    available,
    // Include website in EventInfo for footer links
    website: config.website,
  };
};

const readEnv = (name: string): string | undefined => {
  if (typeof process === 'undefined' || !process.env) return undefined;
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

const normalizeToken = (value?: string | null): string => {
  return (value || '').trim().toLowerCase();
};

const normalizeHostname = (hostname?: string): string => {
  let raw = hostname;

  if (!raw && typeof window !== 'undefined' && window.location?.hostname) {
    raw = window.location.hostname;
  }

  if (!raw) return '';

  const normalized = raw.trim().toLowerCase();

  try {
    if (normalized.includes('://')) {
      return new URL(normalized).hostname.toLowerCase();
    }
  } catch {
    // Fall through to simple host cleanup below.
  }

  return normalized.split('/')[0].split(':')[0];
};

const isLocalHostname = (hostname: string): boolean => {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.endsWith('.local');
};

const normalizeTenantId = (value?: string | null): string | null => {
  const token = normalizeToken(value);
  if (!token) return null;
  return TENANT_ALIASES[token] || token;
};

export const getRouteEventIdFromPathname = (pathname?: string): string | null => {
  const normalizedPath = normalizeToken(pathname);
  const match = normalizedPath.match(/^\/events\/([^/]+)/);
  if (!match) return null;
  return normalizeTenantId(match[1]);
};

const readEventTenantEnv = (): string | undefined => {
  return (
    readEnv('EXPO_PUBLIC_EVENT_TENANT') ||
    readEnv('EXPO_PUBLIC_TENANT') ||
    readEnv('EVENT_TENANT')
  );
};

const readEventIdsEnv = (): string[] | null => {
  const raw = readEnv('EXPO_PUBLIC_EVENT_IDS') || readEnv('EVENT_IDS');
  if (!raw) return null;

  const eventIds = raw
    .split(',')
    .map(value => normalizeToken(value))
    .filter(Boolean);

  return eventIds.length > 0 ? eventIds : null;
};

const resolveEventIdsForTenant = (tenantId: string): string[] | null => {
  if (tenantId === MAIN_EVENT_TENANT_ID) {
    return null;
  }

  const event = EVENTS[tenantId];
  if (event?.eventType === 'whitelabel') {
    if (event.tour?.role === 'hub' || getEventTourHubId(tenantId) === tenantId) {
      return getEventTourFamilyIds(tenantId);
    }

    return [tenantId];
  }

  const familyIds = getEventTourFamilyIds(tenantId);
  if (familyIds.length > 0) {
    return familyIds;
  }

  const prefixMatches = Object.values(EVENTS)
    .filter(event => event.eventType === 'whitelabel' && event.id.startsWith(tenantId))
    .map(event => event.id);

  return prefixMatches;
};

const buildTenantContext = (
  tenantId: string,
  source: EventTenantSource,
  hostname: string,
  eventIdsOverride?: string[] | null
): EventTenantContext => {
  const eventIds = eventIdsOverride ?? resolveEventIdsForTenant(tenantId);

  return {
    id: tenantId,
    source,
    hostname,
    eventIds,
    showAllEvents: eventIds === null,
  };
};

// Build AVAILABLE_EVENTS from EVENTS config. Tenant filtering happens in
// getAvailableEvents() so every consumer shares the same env/config policy.
export const AVAILABLE_EVENTS: EventInfo[] = sortEventInfos(
  Object.values(EVENTS)
    .filter(event => event.eventType === 'whitelabel')
    .map(event => configToEventInfo(event, true))
);

export const getEventTenantContext = (hostname?: string): EventTenantContext => {
  const normalizedHostname = normalizeHostname(hostname);

  const eventIdsFromEnv = readEventIdsEnv();
  if (eventIdsFromEnv) {
    return buildTenantContext('custom', 'env-event-ids', normalizedHostname, eventIdsFromEnv);
  }

  const envTenantId = normalizeTenantId(readEventTenantEnv());
  if (envTenantId) {
    return buildTenantContext(envTenantId, 'env-tenant', normalizedHostname);
  }

  const configTenantId = normalizeTenantId(ENV_CONFIG.getTenant(normalizedHostname).slug);
  if (configTenantId && configTenantId !== MAIN_EVENT_TENANT_ID) {
    return buildTenantContext(configTenantId, 'config', normalizedHostname);
  }

  return buildTenantContext(MAIN_EVENT_TENANT_ID, 'default', normalizedHostname);
};

// Get available events based on current context
export const getAvailableEvents = (hostname?: string): EventInfo[] => {
  const tenantContext = getEventTenantContext(hostname);
  const availableEvents = AVAILABLE_EVENTS.filter(event => event.available);

  if (tenantContext.showAllEvents) {
    return sortEventInfos(availableEvents);
  }

  const allowedEventIds = new Set(tenantContext.eventIds || []);
  return sortEventInfos(availableEvents.filter(event => allowedEventIds.has(event.id)));
};

// Get current event from route, hostname, or context
export const getCurrentEvent = (eventId?: string, hostname?: string): EventInfo | null => {
  const availableEvents = getAvailableEvents(hostname);

  if (eventId) {
    return availableEvents.find(e => e.id === eventId) || null;
  }

  const tenantContext = getEventTenantContext(hostname);

  if (!tenantContext.showAllEvents) {
    const tenantEvent = availableEvents.find(event => event.id === tenantContext.id);
    return tenantEvent || availableEvents[0] || null;
  }

  // Core HashPass domains should not inherit an event-specific tenant.
  return EVENTS.default ? configToEventInfo(EVENTS.default, true) : null;
};

export const isGlobalEventTenant = (hostname?: string): boolean => {
  return getEventTenantContext(hostname).showAllEvents;
};

// Backward-compatible name used by existing UI components.
export const isMainBranch = isGlobalEventTenant();

// Check if event selector should be shown
export const shouldShowEventSelector = (): boolean => {
  return getAvailableEvents().length > 1;
};

// Get event-specific quick access items
export const getEventQuickAccessItems = (eventId: string) => {
  const event = EVENTS[eventId];

  // If event has quickAccessItems configured, return them
  if (event?.quickAccessItems) {
    return event.quickAccessItems;
  }

  // Default items for events without custom quickAccessItems
  return [
    {
      id: 'speakers',
      title: 'Speakers',
      subtitle: 'Meet the experts',
      icon: 'people',
      color: '#007AFF',
      route: `/events/${eventId}/speakers`
    },
    {
      id: 'agenda',
      title: 'Agenda',
      subtitle: 'Event Schedule',
      icon: 'event',
      color: '#34A853',
      route: `/events/${eventId}/agenda`
    },
    {
      id: 'info',
      title: 'Event Info',
      subtitle: 'Details & Logistics',
      icon: 'info',
      color: '#FF9500',
      route: `/events/${eventId}/event-info`
    }
  ];
};
