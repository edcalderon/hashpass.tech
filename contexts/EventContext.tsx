import React, { createContext, useContext, ReactNode } from 'react';
import { EventConfig, EVENTS } from '../config/events';
import { getCurrentEvent } from '../lib/event-detector';

interface EventContextType {
  event: EventConfig | null;
  hasFeature: (feature: string) => boolean;
  getApiEndpoint: (endpoint: string) => string | null;
  getRoute: (route: keyof EventConfig['routes']) => string;
  getBranding: () => EventConfig['branding'] | null;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

interface EventProviderProps {
  children: ReactNode;
}

export function EventProvider({ children }: EventProviderProps) {
  // Get EventInfo from event-detector
  const eventInfo = getCurrentEvent();
  
  // Convert EventInfo to EventConfig by looking up the full config
  const event: EventConfig | null = eventInfo 
    ? (EVENTS[eventInfo.id as keyof typeof EVENTS] || null)
    : null;

  const hasFeature = (feature: string) => {
    return event?.features?.includes(feature) ?? false;
  };

  const getApiEndpoint = (endpoint: string) => {
    if (!event?.api?.basePath) return null;
    return `${event.api.basePath}${endpoint}`;
  };

  const getRoute = (route: keyof EventConfig['routes']) => {
    return event?.routes?.[route] || '/';
  };

  const getBranding = () => {
    return event?.branding ?? null;
  };

  const value: EventContextType = {
    event,
    hasFeature,
    getApiEndpoint,
    getRoute,
    getBranding,
  };

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvent(): EventContextType {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvent must be used within an EventProvider');
  }
  return context;
}

// Helper hook to ensure event is available
// Use this when you're certain the event should be available
export function useEventRequired(): EventContextType & { event: EventConfig } {
  const context = useEvent();
  if (!context.event) {
    throw new Error('No event configuration available');
  }
  return context as EventContextType & { event: EventConfig };
}
