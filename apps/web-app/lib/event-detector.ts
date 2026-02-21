// Event Detection Utility
// This utility detects available events based on the current deployment context

import { EventConfig, EVENTS } from '../config/events';

// EventInfo is the UI-focused view of EventConfig
// It omits backend-specific fields (name, domain) and adds availability flag
export interface EventInfo extends Omit<EventConfig, 'name' | 'domain'> {
  available: boolean;
}

// Available events configuration
// In branch-based deployments, only the current event will be available
// In main repo, all events will be available

import { ENV_CONFIG } from '@hashpass/config';

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

// Build AVAILABLE_EVENTS from EVENTS config
export const AVAILABLE_EVENTS: EventInfo[] = Object.values(EVENTS)
  .filter(event => event.eventType === 'whitelabel')
  .map(event => {
    // Determine availability based on current context
    // In a multi-tenant world, all whitelabel events are technically "available" to the runtime
    const available = true;
    return configToEventInfo(event, available);
  });


// Get available events based on current context
export const getAvailableEvents = (): EventInfo[] => {
  return AVAILABLE_EVENTS.filter(event => event.available);
};

// Get current event from route, hostname, or context
export const getCurrentEvent = (eventId?: string): EventInfo | null => {
  if (eventId) {
    return AVAILABLE_EVENTS.find(e => e.id === eventId) || null;
  }

  // Detect current tenant from hostname via config layer
  const tenant = ENV_CONFIG.getTenant();

  // Find matching event configuration from the detected tenant slug
  if (tenant && tenant.slug !== 'main') {
    const event = AVAILABLE_EVENTS.find(e => e.id === tenant.slug);
    if (event) return event;
  }

  // Default to BSL2025 for now if no specific tenant detected or if main
  return AVAILABLE_EVENTS.find(e => e.id === 'bsl2025') || null;
};

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
      route: `/events/${eventId}/info`
    }
  ];
};