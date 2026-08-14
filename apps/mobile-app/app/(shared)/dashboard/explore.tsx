import { useCallback, useEffect, useRef, useState } from "react";
import { useEvent } from "@contexts/EventContext";
import { useAuth } from "../../../hooks/useAuth";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getAvailableEvents,
  getCurrentEvent,
  isMainBranch,
  type EventInfo,
} from "../../../lib/event-detector";
import { useDiscoveryScope } from "../../../providers/DiscoveryScopeProvider";
import Explorer from "../../../components/explorer/Explorer";

export default function ExploreScreen() {
  const { event: currentEventFromContext } = useEvent();
  const { isLoggedIn, isLoading: authLoading, dbUserId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  // The user's own "show all events" discovery preference (Settings). Always
  // on for the main hashpass.tech domain -- see DiscoveryScopeProvider.
  const { showAllTenants } = useDiscoveryScope();
  const [availableEvents, setAvailableEvents] = useState<EventInfo[]>(() =>
    getAvailableEvents(undefined, { includeAllTenants: showAllTenants }),
  );
  const isGlobalExplorer = isMainBranch || showAllTenants;
  const routeEventIdParam =
    typeof params.eventId === "string" ? params.eventId : undefined;
  const isTourView = params.tour === "bsl-on-tour";
  const shouldResetExplorer = params.reset === "1";
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

  const handleRefreshEvents = useCallback(async () => {
    // Re-read the tenant-aware catalogue so a refresh updates the Explorer
    // cards and the catalogue summary together. This is deliberately owned by
    // the route, where a remote event source can be added without coupling it
    // to the Explorer presentation component.
    setAvailableEvents(
      getAvailableEvents(undefined, { includeAllTenants: showAllTenants }),
    );
  }, [showAllTenants]);

  // Toggling the discovery preference in Settings should update this screen
  // immediately, not just on the next manual/route-triggered reload.
  useEffect(() => {
    setAvailableEvents(
      getAvailableEvents(undefined, { includeAllTenants: showAllTenants }),
    );
  }, [showAllTenants]);

  useEffect(() => {
    // The global brand mark and the Explorer filter Reset both route here.
    // A reset is intentionally stronger than an event-id deep link: it
    // returns the global explorer to its four-slide Hashpass showcase.
    if (shouldResetExplorer) {
      lastSyncedRouteEventIdRef.current = undefined;
      setSelectedEvent(null);
      router.setParams({
        reset: undefined,
        eventId: undefined,
        tour: undefined,
      } as any);
      return;
    }

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
  }, [isTourView, routeEventIdParam, router, shouldResetExplorer]);

  return (
    <Explorer
      events={availableEvents}
      selectedEvent={selectedEvent}
      onSelectEvent={setSelectedEvent}
      onResetSelection={() => setSelectedEvent(null)}
      isLoggedIn={isLoggedIn}
      dbUserId={dbUserId}
      isLoading={authLoading && availableEvents.length === 0}
      isGlobalExplorer={isGlobalExplorer}
      onRefreshEvents={handleRefreshEvents}
    />
  );
}
