import { useEffect, useRef, useState } from "react";
import { useEvent } from "@contexts/EventContext";
import { useAuth } from "../../../hooks/useAuth";
import { useLocalSearchParams } from "expo-router";
import {
  getAvailableEvents,
  getCurrentEvent,
  isMainBranch,
  type EventInfo,
} from "../../../lib/event-detector";
import Explorer from "../../../components/explorer/Explorer";

export default function ExploreScreen() {
  const { event: currentEventFromContext } = useEvent();
  const { isLoggedIn, isLoading: authLoading, dbUserId } = useAuth();
  const params = useLocalSearchParams();
  const availableEvents = getAvailableEvents();
  const isGlobalExplorer = isMainBranch;
  const routeEventIdParam =
    typeof params.eventId === "string" ? params.eventId : undefined;
  const isTourView = params.tour === "bsl-on-tour";
  const currentEventFromRoute = getCurrentEvent(routeEventIdParam);
  const currentEventInfo: EventInfo | null = currentEventFromRoute
    ? currentEventFromRoute
    : currentEventFromContext
      ? availableEvents.find(
          (event: EventInfo) => event.id === currentEventFromContext.id,
        ) || null
      : availableEvents[0] || null;

  const [selectedEvent, setSelectedEvent] = useState<EventInfo | null>(
    isTourView || isGlobalExplorer ? null : currentEventInfo,
  );
  const lastSyncedRouteEventIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isTourView) {
      lastSyncedRouteEventIdRef.current = undefined;
      setSelectedEvent(null);
      return;
    }

    if (
      !routeEventIdParam ||
      routeEventIdParam === lastSyncedRouteEventIdRef.current
    )
      return;
    lastSyncedRouteEventIdRef.current = routeEventIdParam;

    const matchedEvent = getCurrentEvent(routeEventIdParam);
    if (matchedEvent) setSelectedEvent(matchedEvent);
  }, [isTourView, routeEventIdParam]);

  return (
    <Explorer
      events={availableEvents}
      selectedEvent={selectedEvent}
      onSelectEvent={setSelectedEvent}
      isLoggedIn={isLoggedIn}
      dbUserId={dbUserId}
      isLoading={authLoading && availableEvents.length === 0}
      isGlobalExplorer={isGlobalExplorer}
    />
  );
}
