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

// Detect deployment context from environment variables
export const isMainBranch = typeof process !== 'undefined' && (
  process.env.AMPLIFY_SHOW_ALL_EVENTS === 'true' ||
  process.env.NEXT_PUBLIC_SHOW_ALL_EVENTS === 'true' ||
  (typeof window !== 'undefined' && (window as any).__AMPLIFY_SHOW_ALL_EVENTS__ === true)
);

const currentEventId = typeof process !== 'undefined' 
  ? (process.env.AMPLIFY_EVENT_ID || process.env.NEXT_PUBLIC_EVENT_ID || 'bsl2025')
  : 'bsl2025';

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
// This ensures all event data is centralized in config/events.ts
export const AVAILABLE_EVENTS: EventInfo[] = Object.values(EVENTS)
  .filter(event => {
    // Only include whitelabel events (exclude 'default' event)
    return event.eventType === 'whitelabel';
  })
  .map(event => {
    // Determine availability based on current context
    const available = isMainBranch || currentEventId === event.id;
    return configToEventInfo(event, available);
  });

// Get available events based on current context
export const getAvailableEvents = (): EventInfo[] => {
  return AVAILABLE_EVENTS.filter(event => event.available);
};

// Get current event from route or context
export const getCurrentEvent = (eventId?: string): EventInfo | null => {
  if (eventId) {
    return AVAILABLE_EVENTS.find(e => e.id === eventId) || null;
  }
  
  // Default to BSL2025 if no event specified
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