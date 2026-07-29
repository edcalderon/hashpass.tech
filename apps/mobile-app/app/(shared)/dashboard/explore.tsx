import { useRef, useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Animated, StatusBar, Platform, InteractionManager, useWindowDimensions } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useScroll } from '@contexts/ScrollContext';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { MaterialIcons } from '../../../lib/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import EventBanner from '../../../components/EventBanner';
import PassesDisplay from '../../../components/PassesDisplay';
import { useHorizontalScrollArrows } from '../../../hooks/useHorizontalScrollArrows';
import {
  getAvailableEvents,
  getCurrentEvent,
  shouldShowEventSelector,
  getEventQuickAccessItems,
  isMainBranch,
  type EventInfo
} from '../../../lib/event-detector';
import { getSelectEventCardWatermark } from '../../../lib/event-branding';
import { t } from '@lingui/macro';
import { COPILOT_TUTORIALS_ENABLED, CopilotStep, walkthroughable, useCopilot } from '@lib/copilot-shim';
import { useTutorialPreferences } from '../../../hooks/useTutorialPreferences';

type QuickAccessItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  route: string;
};

// Disabled: on-device reproduction (v1.8.207) showed the crash ("Unsupported
// top level event type 'topLayout' dispatched") still fired from
// CopilotStep's own render even with patches/react-native-copilot@3.3.3.patch
// applied (that patch only removed one of several onLayout attachments
// inside the library). 'react-native-copilot' is now replaced app-wide by
// '@lib/copilot-shim', a local no-op passthrough — see that file for the
// full history. This flag is effectively moot (useCopilot().start() always
// returns false from the shim), kept only so this effect's early-return
// structure stays intact if a real, Fabric-compatible walkthrough library
// replaces the shim later.
const TUTORIAL_AUTO_START_ENABLED = COPILOT_TUTORIALS_ENABLED;

const CopilotView = walkthroughable(View);
const CopilotText = walkthroughable(Text);
const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);

export default function ExploreScreen() {
  const { scrollY, headerHeight } = useScroll();
  const { width: windowWidth } = useWindowDimensions();
  // Calculate safe area for nav bar overlay
  const navBarHeight = (StatusBar.currentHeight || 0) + 80; // StatusBar + header content
  const { event: currentEventFromContext } = useEvent();
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const styles = getStyles(isDark, colors);
  const copilot = useCopilot() as any;
  const startTutorial = typeof copilot?.start === 'function' ? copilot.start : null;
  const copilotEvents = copilot?.copilotEvents;
  const { shouldShowTutorial, markTutorialCompleted, isReady, mainTutorialCompleted, updateTutorialStep, mainTutorialProgress } = useTutorialPreferences();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const tutorialStartedRef = useRef(false);
  
  // Get current event from route - getCurrentEvent returns EventInfo | null
  const currentEventFromRoute = getCurrentEvent(params.eventId as string);
  const availableEvents = getAvailableEvents();
  
  // Convert EventConfig from context to EventInfo if needed, or use route event
  const currentEventInfo: EventInfo | null = currentEventFromRoute 
    ? currentEventFromRoute
    : currentEventFromContext 
      ? availableEvents.find((e: EventInfo) => e.id === currentEventFromContext.id) || null
      : availableEvents[0] || null;
  
  // Initialize all state hooks at the top.
  // Tenant mode is host/env based:
  // - hashpass.tech or EXPO_PUBLIC_EVENT_TENANT=main: global explorer
  // - bsl.hashpass.tech or EXPO_PUBLIC_EVENT_TENANT=bsl: BSL-scoped explorer
  const isGlobalExplorer = isMainBranch;
  
  // For global explorer: no selected event needed (shows all events)
  // For event-specific explorer: need selectedEvent for banner and quick access
  const [selectedEvent, setSelectedEvent] = useState<EventInfo | null>(
    isGlobalExplorer ? null : (currentEventInfo || availableEvents[0] || null)
  );
  const [showEventSelector, setShowEventSelector] = useState(shouldShowEventSelector());

  // Quick-access hub tiles (Peru/Chile/Colombia/Archive) navigate to
  // /events/{id}/home, which redirects back here with ?eventId={id} instead of
  // rendering a separate screen. Without this sync, that navigation lands back
  // on this same mounted explore screen with selectedEvent untouched, so the
  // "Select Event" card never highlights and Quick Access never switches to the
  // tapped event's own items (Agenda/Networking/Speakers/Event Info) -- it only
  // worked when tapping the event card directly, which calls setSelectedEvent
  // via handleEventSelect below. Applies in both explorer modes now: global
  // explorer also selects in-place (see handleEventSelect), so drilling from
  // the hub into e.g. Chile 2026 there needs the same sync. Guarded by a ref
  // (not just the params value) so this only reacts to the route param
  // actually changing, and never clobbers a manual card selection, which
  // doesn't touch this param at all.
  const routeEventIdParam = typeof params.eventId === 'string' ? params.eventId : undefined;
  // Starts undefined, NOT routeEventIdParam -- if it started pre-populated
  // with the param already present at mount, the effect below would see
  // "unchanged" on its very first run and skip syncing, exactly the case
  // (fresh mount or direct/reloaded ?eventId=... URL) this effect exists to
  // handle. Global explorer's selectedEvent starts at null regardless of the
  // route param, so skipping that first sync left it stuck showing the
  // generic banner instead of the linked event.
  const lastSyncedRouteEventIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!routeEventIdParam) return;
    if (routeEventIdParam === lastSyncedRouteEventIdRef.current) return;
    lastSyncedRouteEventIdRef.current = routeEventIdParam;

    const matchedEvent = getCurrentEvent(routeEventIdParam);
    if (matchedEvent) {
      setSelectedEvent(matchedEvent);
    }
  }, [routeEventIdParam]);
  // Quick Access card dimensions (matching styles.quickAccessCard).
  const quickAccessCardWidth = 132;
  const quickAccessCardSpacing = 10;
  const quickAccessScroll = useHorizontalScrollArrows({
    cardWidth: quickAccessCardWidth,
    cardSpacing: quickAccessCardSpacing,
    androidFallbackWidth: Math.max(0, windowWidth - 40),
  });

  // Select Event card dimensions (matching styles.eventCard's non-global width/margin).
  const eventSelectorCardWidth = 200;
  const eventSelectorCardSpacing = 12;
  const eventSelectorScroll = useHorizontalScrollArrows({
    cardWidth: eventSelectorCardWidth,
    cardSpacing: eventSelectorCardSpacing,
    androidFallbackWidth: Math.max(0, windowWidth - 40),
  });

  // Reset ref when tutorial is reset (completion status changes or progress is cleared)
  useEffect(() => {
    if (!TUTORIAL_AUTO_START_ENABLED) return;

    if (!mainTutorialCompleted && mainTutorialProgress === null) {
      tutorialStartedRef.current = false;
    }
  }, [mainTutorialCompleted, mainTutorialProgress]);

  // Auto-start tutorial for new users - only once, when everything is ready
  useEffect(() => {
    if (!TUTORIAL_AUTO_START_ENABLED) return;

    // Check if tutorial was reset - if progress is null and not completed, reset the ref
    if (!mainTutorialCompleted && mainTutorialProgress === null) {
      tutorialStartedRef.current = false;
    }
    
    // Prevent multiple starts
    if (tutorialStartedRef.current) {
      console.log('Tutorial already started, skipping auto-start');
      return;
    }
    
    // Wait for all conditions to be met
    if (!isReady) {
      console.log('Tutorial auto-start: Waiting for preferences to be ready');
      return;
    }
    
    if (!isLoggedIn) {
      console.log('Tutorial auto-start: User not logged in');
      return;
    }
    
    if (authLoading) {
      console.log('Tutorial auto-start: Auth still loading');
      return;
    }
    
    const shouldShow = shouldShowTutorial('main');
    console.log('Tutorial auto-start check:', {
      shouldShow,
      mainTutorialCompleted,
      isReady,
      isLoggedIn,
      authLoading,
      mainTutorialProgress: mainTutorialProgress?.status,
      tutorialStartedRef: tutorialStartedRef.current
    });
    
    if (!shouldShow) {
      console.log('Tutorial auto-start: shouldShowTutorial returned false');
      return;
    }

    console.log('Tutorial auto-start: All conditions met, starting tutorial...');

    // Use InteractionManager to ensure UI is ready
    const interaction = InteractionManager.runAfterInteractions(() => {
      // Additional delay to ensure all CopilotSteps are registered (especially from _layout.tsx Header)
      const timer = setTimeout(() => {
        // Double-check the ref hasn't been set by another effect
        if (!tutorialStartedRef.current) {
          tutorialStartedRef.current = true;
          try {
            console.log('Tutorial auto-start: Calling startTutorial()');
            // Check if startTutorial is a function
            if (!startTutorial) {
              console.error('startTutorial is not a function:', typeof startTutorial, startTutorial);
              tutorialStartedRef.current = false;
              return;
            }

            // Check if steps are registered - getSteps is not available in current version
            // Proceed with tutorial start without step verification
            console.log('Starting tutorial without step verification');

            // Start tutorial first, then update database after it successfully starts
            const result = startTutorial();
            console.log('Tutorial start result:', result);

            // Mark tutorial as started in database after a short delay to ensure tutorial started
            setTimeout(() => {
              updateTutorialStep('main', 1).catch((err: unknown) => console.error('Error updating tutorial step:', err));
            }, 500);
          } catch (error) {
            console.error('Error starting tutorial:', error);
            console.error('Error details:', error instanceof Error ? {
              message: error.message,
              stack: error.stack,
              name: error.name
            } : error);
            tutorialStartedRef.current = false;
          }
        } else {
          console.log('Tutorial auto-start: Ref was set to true, skipping start');
        }
      }, 4000); // Increased delay to ensure all CopilotSteps are registered (layout + header need time to mount)

      return () => clearTimeout(timer);
    });

    return () => {
      interaction.cancel();
    };
  }, [isReady, isLoggedIn, authLoading, shouldShowTutorial, startTutorial, mainTutorialCompleted, updateTutorialStep, mainTutorialProgress]);

  // Listen for tutorial events
  useEffect(() => {
    if (!TUTORIAL_AUTO_START_ENABLED) return;

    if (
      !copilotEvents ||
      typeof copilotEvents.on !== 'function' ||
      typeof copilotEvents.off !== 'function'
    ) {
      console.warn('[Explore] Copilot events unavailable; tutorial event tracking disabled.');
      return undefined;
    }

    const handleTutorialStop = () => {
      markTutorialCompleted('main');
    };

    const handleStepChange = (step: any) => {
      // Track step progress
      if (step && step.order) {
        updateTutorialStep('main', step.order);
      }
    };

    copilotEvents.on('stop', handleTutorialStop);
    copilotEvents.on('stepChange', handleStepChange);

    return () => {
      copilotEvents.off('stop', handleTutorialStop);
      copilotEvents.off('stepChange', handleStepChange);
    };
  }, [copilotEvents, markTutorialCompleted, updateTutorialStep]);

  // Early return if no event info is available (after all hooks are declared)
  if (!currentEventInfo) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.text.primary }}>{t({ id: 'explore.noEvent', message: 'No event available' })}</Text>
      </View>
    );
  }

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  const handleEventSelect = (eventData: EventInfo) => {
    // Select in-place in both modes: highlights the tapped card, swaps the
    // hero banner to that event, and shows its Quick Access below Passes --
    // same behavior the tenant-scoped (BSL) explorer already had. Global
    // explorer used to navigate away to /events/{id}/home instead, which
    // lost the selection the moment you tapped anything.
    setSelectedEvent(eventData);
  };

  const getEventBadgeLabel = (eventData: EventInfo): string => {
    if (eventData.tour?.role === 'archive') return 'Past Event';
    // Hub and stops share the same "BSL ON TOUR" badge -- Peru/Chile/Colombia
    // are stops on the same 2026 tour as the hub, not separate campaigns, so
    // they carry the same brand badge instead of falling back to each
    // event's own name.
    if (eventData.tour?.role === 'hub' || eventData.tour?.role === 'stop') return 'BSL ON TOUR';
    return eventData.name;
  };

  const renderEventCard = (eventData: EventInfo, index: number) => {
    const isArchiveEvent = eventData.tour?.role === 'archive';

    return (
      <TouchableOpacity
        key={eventData.id}
        style={[
          styles.eventCard,
          {
            marginLeft: isGlobalExplorer ? 0 : (index === 0 ? 0 : 12),
            marginBottom: isGlobalExplorer ? 20 : 0,
            width: isGlobalExplorer ? '100%' : 200,
            height: isGlobalExplorer ? 200 : 120,
            borderColor: selectedEvent?.id === eventData.id ? eventData.color : colors.divider,
            borderWidth: selectedEvent?.id === eventData.id ? 2 : 1,
            backgroundColor: isArchiveEvent ? '#08111E' : colors.background.paper,
          },
        ]}
        onPress={() => handleEventSelect(eventData)}
        activeOpacity={0.8}
      >
        <Image
          source={getSelectEventCardWatermark(isDark)}
          style={[
            styles.eventImage,
            isArchiveEvent && styles.archiveEventImage,
          ]}
        />
        <View
          style={[
            styles.eventOverlay,
            isArchiveEvent && styles.archiveEventOverlay,
          ]}
        >
          <View
            style={[
              styles.eventBadge,
              isArchiveEvent && styles.archiveEventBadge,
              !isArchiveEvent && { backgroundColor: eventData.color },
            ]}
          >
            <Text style={styles.eventBadgeText}>{getEventBadgeLabel(eventData)}</Text>
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle}>{eventData.title}</Text>
            <Text style={styles.eventSubtitle}>{eventData.subtitle}</Text>
            {isGlobalExplorer && eventData.eventDateString && (
              <Text style={styles.eventDate}>{eventData.eventDateString}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Compact list row for the global (main hashpass.tech) explorer. The old
  // rendering reused the 200px banner-image card meant for a handful of BSL
  // tour stops -- fine at 5 events, but every row eagerly mounts a full-size
  // background image + gradient overlay, so it gets heavy and visually huge
  // fast as more events are added. This is a plain row (thumbnail + text),
  // selectable the same way as the tour cards (colored left border + tint).
  const renderEventListRow = (eventData: EventInfo, index: number) => {
    const isArchiveEvent = eventData.tour?.role === 'archive';
    const isSelected = selectedEvent?.id === eventData.id;

    return (
      <TouchableOpacity
        key={eventData.id}
        style={[
          styles.eventListRow,
          {
            marginTop: index === 0 ? 0 : 8,
            borderColor: isSelected ? eventData.color : colors.divider,
            borderLeftColor: eventData.color,
            borderLeftWidth: 4,
            backgroundColor: isSelected
              ? `${eventData.color}14`
              : colors.background.paper,
          },
        ]}
        onPress={() => handleEventSelect(eventData)}
        activeOpacity={0.75}
      >
        <Image
          source={getSelectEventCardWatermark(isDark)}
          style={[
            styles.eventListRowThumb,
            { backgroundColor: isArchiveEvent ? '#08111E' : colors.background.default },
          ]}
        />
        <View style={styles.eventListRowBody}>
          <Text style={styles.eventListRowTitle} numberOfLines={1}>
            {eventData.title}
          </Text>
          <Text style={styles.eventListRowSubtitle} numberOfLines={1}>
            {eventData.eventDateString || eventData.subtitle}
          </Text>
        </View>
        <View
          style={[
            styles.eventListRowBadge,
            isArchiveEvent && styles.archiveEventBadge,
            !isArchiveEvent && { backgroundColor: eventData.color },
          ]}
        >
          <Text style={styles.eventBadgeText} numberOfLines={1}>
            {getEventBadgeLabel(eventData)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const getQuickTitle = (id: string, fallback: string) => {
    switch (id) {
      case 'speakers':
        return t({ id: 'explore.quick.speakers.title', message: 'Speakers' });
      case 'agenda':
        return t({ id: 'explore.quick.agenda.title', message: 'Agenda' });
      case 'info':
        return t({ id: 'explore.quick.info.title', message: 'Event Info' });
      case 'networking':
        return t({ id: 'explore.quick.networking.title', message: 'Networking Center' });
      case 'information':
        return t({ id: 'explore.quick.information.title', message: 'Event Information' });
      case 'event-info':
        return t({ id: 'explore.quick.event-info.title', message: 'Event Information' });
      default:
        return fallback;
    }
  };

  const getQuickSubtitle = (id: string, fallback: string) => {
    switch (id) {
      case 'speakers':
        return t({ id: 'explore.quick.speakers.subtitle', message: 'Meet the experts' });
      case 'agenda':
        return t({ id: 'explore.quick.agenda.subtitle', message: 'Event Schedule' });
      case 'info':
        return t({ id: 'explore.quick.info.subtitle', message: 'Details & Logistics' });
      case 'networking':
        return t({ id: 'explore.quick.networking.subtitle', message: 'Find and connect' });
      case 'information':
        return t({ id: 'explore.quick.information.subtitle', message: 'Details & Logistics' });
      case 'event-info':
        return t({ id: 'explore.quick.event-info.subtitle', message: 'Details & Logistics' });
      default:
        return fallback;
    }
  };

  const renderQuickAccessItem = (item: QuickAccessItem, index: number) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.quickAccessCard,
        { marginLeft: index === 0 ? 0 : 12 }
      ]}
      onPress={() => router.push(item.route as any)}
    >
      <View style={[styles.cardIcon, { backgroundColor: item.color + '18' }]}>
        <MaterialIcons name={item.icon as any} size={22} color={item.color} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {getQuickTitle(item.id, item.title)}
      </Text>
      <Text style={styles.cardSubtitle} numberOfLines={2}>
        {getQuickSubtitle(item.id, item.subtitle)}
      </Text>
    </TouchableOpacity>
  );

  // Get quick access items based on selected event
  const getQuickAccessItems = (): QuickAccessItem[] => {
    if (!selectedEvent) return [];
    return getEventQuickAccessItems(selectedEvent.id) as QuickAccessItem[];
  };

  // Tour stop ids (Peru/Chile/Colombia/Archive), excluding the hub itself --
  // used to show every held pass across the tour when the hub is selected,
  // since a user can hold passes for more than one upcoming stop at once.
  const tourStopEventIds = availableEvents
    .filter((event: EventInfo) => event.tour && event.tour.role !== 'hub')
    .map((event: EventInfo) => event.id);

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        style={styles.scrollView}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ 
          paddingBottom: 40,
        }}
      >
        {/* Event Banner (now scrolls with content) */}
        {/* Banner starts from top, nav bar floats on top with blur */}
        {isGlobalExplorer && !selectedEvent ? (
          /* GLOBAL EXPLORER MODE, nothing selected yet (hashpass.tech / main tenant) */
          /* Shows the generic HASHPASS platform banner until an event is tapped below */
          <EventBanner
            title="HASHPASS Events"
            subtitle="Discover and explore all available events"
            date="Global Event Explorer"
            backgroundColor="#6366f1"
            showCountdown={false}
            showLiveIndicator={false}
            eventId="default"
          />
        ) : (
          /* A specific event is selected -- tenant-scoped explorer (bsl.hashpass.tech)
             always has one via its initial state, global explorer gets one once a
             card below is tapped. Same banner either way: countdown/live indicator
             for real dated stops, static for the tour hub. */
          <EventBanner
            title={selectedEvent?.title || t({ id: 'explore.banner.title', message: 'BSL On Tour' })}
            subtitle={selectedEvent?.subtitle || t({ id: 'explore.banner.subtitle', message: 'Peru, Chile and Colombia 2026 roadshow' })}
            date={selectedEvent?.eventDateString || selectedEvent?.subtitle || t({ id: 'explore.banner.date', message: '2026 Tour' })}
            showCountdown={Boolean(selectedEvent?.eventStartDate) && selectedEvent?.tour?.role !== 'hub'}
            showLiveIndicator={Boolean(selectedEvent?.eventStartDate) && selectedEvent?.tour?.role !== 'hub'}
            eventStartDate={selectedEvent?.eventStartDate}
            eventId={selectedEvent?.id}
            eventImage={selectedEvent?.image}
          />
        )}
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            {isGlobalExplorer ? (
              /* GLOBAL EXPLORER: compact, selectable list of all events.
                 Tapping a row selects it in-place (same as the tenant-scoped
                 explorer's cards below) -- swaps the hero banner above and
                 reveals that event's own Quick Access below Passes, instead
                 of navigating away to a separate screen. Compact rows (not
                 the 200px banner cards used for the handful of BSL tour
                 stops) keep this list manageable as more events are added. */
              <View style={styles.eventsSection}>
                <Text style={styles.sectionTitle}>
                  {t({ id: 'explore.banner.exploreAllEvents', message: 'Explore All Events' })}
                </Text>
                <Text style={styles.sectionDescription}>
                  Select an event to view its speakers, agenda, and quick access
                </Text>
                <View>
                  {availableEvents.map((eventData: EventInfo, index: number) => renderEventListRow(eventData, index))}
                </View>
              </View>
            ) : (
              /* EVENT-SPECIFIC EXPLORER: Show event selector if multiple events available */
              /* Tenant scopes can expose one event or an event family. */
              showEventSelector && (
                <View style={styles.eventSelectorContainer}>
                  <Text style={styles.eventSelectorTitle}>{t({ id: 'explore.selectEvent', message: 'Select Event' })}</Text>
                  <View style={styles.eventSelectorScrollWrapper}>
                    {eventSelectorScroll.canScrollLeft && (
                      <Reanimated.View style={[styles.scrollArrowLeft, eventSelectorScroll.leftArrowStyle]}>
                        <TouchableOpacity
                          style={styles.scrollArrowButton}
                          onPress={() => eventSelectorScroll.scroll('left')}
                        >
                          <MaterialIcons name="chevron-left" size={24} color={colors.primary} />
                        </TouchableOpacity>
                      </Reanimated.View>
                    )}
                    <ScrollView
                      ref={eventSelectorScroll.scrollRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.eventSelector}
                      onScroll={eventSelectorScroll.handleScroll}
                      onScrollBeginDrag={eventSelectorScroll.handleScrollBeginDrag}
                      onScrollEndDrag={eventSelectorScroll.handleScrollEndDrag}
                      onMomentumScrollEnd={eventSelectorScroll.handleMomentumScrollEnd}
                      scrollEventThrottle={Platform.OS === 'web' ? 0 : 16}
                      decelerationRate="fast"
                      snapToInterval={eventSelectorCardWidth + eventSelectorCardSpacing}
                      snapToAlignment="start"
                      disableIntervalMomentum
                      onLayout={Platform.OS === 'android' ? undefined : eventSelectorScroll.handleLayout}
                      onContentSizeChange={eventSelectorScroll.handleContentSizeChange}
                      // @ts-ignore - onWheel supported in RN Web
                      onWheel={eventSelectorScroll.handleWheel}
                    >
                      {availableEvents.map((eventData: EventInfo, index: number) => renderEventCard(eventData, index))}
                    </ScrollView>
                    {eventSelectorScroll.canScrollRight && (
                      <Reanimated.View style={[styles.scrollArrowRight, eventSelectorScroll.rightArrowStyle]}>
                        <TouchableOpacity
                          style={styles.scrollArrowButton}
                          onPress={() => eventSelectorScroll.scroll('right')}
                        >
                          <MaterialIcons name="chevron-right" size={24} color={colors.primary} />
                        </TouchableOpacity>
                      </Reanimated.View>
                    )}
                  </View>
                </View>
              )
            )}
          </View>
        </View>

        {/* User Passes - Show if logged in */}
        {isLoggedIn && (
          <CopilotStep text="This is where you can view your event passes. Your passes show your ticket type and access level for the event." order={8} name="yourPasses">
            <CopilotView style={{ paddingHorizontal: 20, paddingTop: 20 }}>
              <Text style={styles.sectionTitle}>{t({ id: 'explore.yourPasses', message: 'Your Passes' })}</Text>
              <PassesDisplay
                mode="dashboard"
                showTitle={false}
                showPassComparison={false}
                eventId={selectedEvent?.tour?.role !== 'hub' ? selectedEvent?.id : undefined}
                eventIds={selectedEvent?.tour?.role === 'hub' ? tourStopEventIds : undefined}
              />
            </CopilotView>
          </CopilotStep>
        )}

        {/* Quick Access Section - shows once an event is selected. Always true
            for the tenant-scoped explorer (has one from initial state); in the
            global explorer this only appears after tapping an event above. */}
        {Boolean(selectedEvent) && (
          <CopilotStep text="Quick Access cards let you quickly navigate to important sections like Speakers, Agenda, Networking Center, and Event Information. Swipe horizontally to see all options." order={9} name="quickAccess">
            <CopilotView style={styles.section}>
              <Text style={styles.sectionTitle}>{t({ id: 'explore.quickAccess', message: 'Quick Access' })}</Text>
            <View style={styles.quickAccessContainer}>
              {quickAccessScroll.canScrollLeft && (
                <Reanimated.View style={[styles.scrollArrowLeft, quickAccessScroll.leftArrowStyle]}>
                  <TouchableOpacity
                    style={styles.scrollArrowButton}
                    onPress={() => quickAccessScroll.scroll('left')}
                  >
                    <MaterialIcons name="chevron-left" size={24} color={colors.primary} />
                  </TouchableOpacity>
                </Reanimated.View>
              )}
              <ScrollView
                ref={quickAccessScroll.scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
                onScroll={quickAccessScroll.handleScroll}
                onScrollBeginDrag={quickAccessScroll.handleScrollBeginDrag}
                onScrollEndDrag={quickAccessScroll.handleScrollEndDrag}
                onMomentumScrollEnd={quickAccessScroll.handleMomentumScrollEnd}
                scrollEventThrottle={Platform.OS === 'web' ? 0 : 16}
                decelerationRate="fast"
                snapToInterval={quickAccessCardWidth + quickAccessCardSpacing}
                snapToAlignment="start"
                disableIntervalMomentum
                onLayout={Platform.OS === 'android' ? undefined : quickAccessScroll.handleLayout}
                onContentSizeChange={quickAccessScroll.handleContentSizeChange}
                // @ts-ignore - onWheel supported in RN Web
                onWheel={quickAccessScroll.handleWheel}
              >
                {getQuickAccessItems().map((item, index) => renderQuickAccessItem(item, index))}
              </ScrollView>
              {quickAccessScroll.canScrollRight && (
                <Reanimated.View style={[styles.scrollArrowRight, quickAccessScroll.rightArrowStyle]}>
                  <TouchableOpacity
                    style={styles.scrollArrowButton}
                    onPress={() => quickAccessScroll.scroll('right')}
                  >
                    <MaterialIcons name="chevron-right" size={24} color={colors.primary} />
                  </TouchableOpacity>
                </Reanimated.View>
              )}
            </View>
            </CopilotView>
          </CopilotStep>
        )}

        {/* Bottom Spacing handled via contentContainerStyle paddingBottom */}
      </Animated.ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  headerContent: {
    gap: 20,
  },
  eventSelectorContainer: {
    marginTop: 10,
  },
  eventSelectorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  eventSelectorScrollWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventSelector: {
    paddingRight: 20,
  },
  eventsSection: {
    paddingTop: 10,
  },
  sectionDescription: {
    fontSize: 16,
    color: colors.text.secondary,
    marginBottom: 24,
    lineHeight: 22,
  },
  eventsGrid: {
    gap: 20,
  },
  eventCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.background.paper,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  eventImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  archiveEventImage: {
    transform: [{ scale: 1.08 }],
  },
  eventOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
    padding: 12,
  },
  archiveEventOverlay: {
    backgroundColor: 'rgba(4, 10, 24, 0.56)',
  },
  eventBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  archiveEventBadge: {
    backgroundColor: 'rgba(7, 17, 31, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  eventBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventInfo: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  eventTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  eventSubtitle: {
    color: 'white',
    fontSize: 11,
    opacity: 0.9,
  },
  eventDate: {
    color: 'white',
    fontSize: 12,
    opacity: 0.85,
    marginTop: 4,
  },
  eventListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  eventListRowThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  eventListRowBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    minWidth: 0,
  },
  eventListRowTitle: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  eventListRowSubtitle: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  eventListRowBadge: {
    alignSelf: 'flex-start',
    maxWidth: 96,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  horizontalScroll: {
    paddingRight: 16,
  },
  quickAccessContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrowLeft: {
    position: 'absolute',
    left: -8,
    zIndex: 1,
    backgroundColor: colors.background.paper,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollArrowRight: {
    position: 'absolute',
    right: -8,
    zIndex: 1,
    backgroundColor: colors.background.paper,
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scrollArrowButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessCard: {
    width: 132,
    backgroundColor: colors.background.paper,
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'left',
    marginBottom: 4,
    lineHeight: 16,
  },
  cardSubtitle: {
    fontSize: 11,
    color: colors.text.secondary,
    textAlign: 'left',
    lineHeight: 14,
  },
  bottomSpacing: {
    height: 40,
  },
});
