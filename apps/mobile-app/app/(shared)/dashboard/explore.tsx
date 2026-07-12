import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Animated, NativeSyntheticEvent, NativeScrollEvent, StatusBar, Platform, InteractionManager } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useScroll } from '@contexts/ScrollContext';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { MaterialIcons } from '../../../lib/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import EventBanner from '../../../components/EventBanner';
import PassesDisplay from '../../../components/PassesDisplay';
import {
  getAvailableEvents, 
  getCurrentEvent, 
  shouldShowEventSelector,
  getEventQuickAccessItems,
  isMainBranch,
  type EventInfo 
} from '../../../lib/event-detector';
import { resolveEventImageSource } from '../../../lib/event-branding';
import { t } from '@lingui/macro';
import { CopilotStep, walkthroughable, useCopilot } from '@lib/copilot-shim';
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
const TUTORIAL_AUTO_START_ENABLED = false;

const CopilotView = walkthroughable(View);
const CopilotText = walkthroughable(Text);
const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);

export default function ExploreScreen() {
  const { scrollY, headerHeight } = useScroll();
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
  const scrollXRef = useRef(0);
  const maxScrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  const quickAccessScrollRef = useRef<ScrollView>(null);
  const quickAccessLeftArrowOpacity = useSharedValue(0.32);
  const quickAccessRightArrowOpacity = useSharedValue(1);
  const quickAccessLeftArrowStyle = useAnimatedStyle(() => ({
    opacity: quickAccessLeftArrowOpacity.value,
  }));
  const quickAccessRightArrowStyle = useAnimatedStyle(() => ({
    opacity: quickAccessRightArrowOpacity.value,
  }));

  const updateQuickAccessArrows = useCallback((scrollX: number, maxScrollX: number) => {
    const canScrollLeft = scrollX > 0;
    const canScrollRight = scrollX < maxScrollX - 10;

    quickAccessLeftArrowOpacity.value = canScrollLeft ? 1 : 0.32;
    quickAccessRightArrowOpacity.value = canScrollRight ? 1 : 0.32;
  }, [quickAccessLeftArrowOpacity, quickAccessRightArrowOpacity]);

  // Reset ref when tutorial is reset (completion status changes or progress is cleared)
  useEffect(() => {
    if (!mainTutorialCompleted && mainTutorialProgress === null) {
      console.log('Tutorial reset detected - resetting tutorialStartedRef');
      tutorialStartedRef.current = false;
    }
  }, [mainTutorialCompleted, mainTutorialProgress]);

  // Also reset ref when screen comes into focus (useful after navigation from settings)
  useFocusEffect(
    React.useCallback(() => {
      if (!mainTutorialCompleted && mainTutorialProgress === null && !tutorialStartedRef.current) {
        console.log('Screen focused with tutorial reset - ready to start tutorial');
        tutorialStartedRef.current = false;
      }
    }, [mainTutorialCompleted, mainTutorialProgress])
  );

  // Auto-start tutorial for new users - only once, when everything is ready
  useEffect(() => {
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

    if (!TUTORIAL_AUTO_START_ENABLED) {
      // startTutorial() measures/highlights the first CopilotStep target, which
      // crashes the app on Fabric/newArch with "Unsupported top level event
      // type 'topSvgLayout'/'topLayout'/'topDetached' dispatched". Copilot's
      // overlay is already forced to "view" (see CopilotProvider in
      // app/_layout.tsx), so this isn't Copilot's own SVG mask — it's an
      // SVG-based element among the highlighted dashboard targets that
      // doesn't register its layout event correctly under the new
      // architecture. This crashed on every first login, so auto-start is
      // disabled until the specific offending step/component is identified
      // and fixed with a Fabric-compatible SVG version or a non-SVG target.
      console.warn('Tutorial auto-start: disabled (Fabric/SVG layout event crash — see TUTORIAL_AUTO_START_ENABLED)');
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

  const handleQuickAccessWheel = (e: any) => {
    // Map wheel vertical/horizontal delta to horizontal scroll
    const dx = e?.nativeEvent?.deltaX ?? e?.deltaX ?? 0;
    const dy = e?.nativeEvent?.deltaY ?? e?.deltaY ?? 0;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const nextX = Math.max(0, Math.min(scrollXRef.current + delta, maxScrollXRef.current));
    
    if (typeof e?.preventDefault === 'function') {
      e.preventDefault();
    }
    
    if (quickAccessScrollRef.current) {
      quickAccessScrollRef.current.scrollTo({ x: nextX, animated: false });
    }
  };

  // Web-specific scroll detection using DOM events (fallback)
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let scrollElement: HTMLElement | null = null;
    let cleanupFn: (() => void) | null = null;
    let initTimeout: ReturnType<typeof setTimeout> | null = null;

    // Use a small delay to ensure the ScrollView is mounted
    const timeoutId = setTimeout(() => {
      try {
        const scrollRef = quickAccessScrollRef.current as any;
        if (!scrollRef) return;

        // Try to get the underlying DOM element
        const getScrollElement = () => {
          // React Native Web ScrollView structure
          if (scrollRef._component) {
            const innerView = scrollRef._component.querySelector?.('div[style*="overflow"]') ||
                             scrollRef._component.querySelector?.('div[class*="scroll"]') ||
                             scrollRef;
            return innerView;
          }
          return null;
        };

        scrollElement = getScrollElement();
        if (!scrollElement) return;

        const handleWebScroll = () => {
          if (!scrollElement) return;
          
          const currentScrollX = scrollElement.scrollLeft;
          const currentMaxScrollX = scrollElement.scrollWidth - scrollElement.clientWidth;
          
          scrollXRef.current = currentScrollX;
          maxScrollXRef.current = currentMaxScrollX;
          viewportWidthRef.current = scrollElement.clientWidth;
          contentWidthRef.current = scrollElement.scrollWidth;
          updateQuickAccessArrows(currentScrollX, currentMaxScrollX);
        };
        
        scrollElement.addEventListener('scroll', handleWebScroll, { passive: true });
        
        // Initial check after a brief delay
        initTimeout = setTimeout(handleWebScroll, 100);

        cleanupFn = () => {
          if (initTimeout) clearTimeout(initTimeout);
          if (scrollElement) {
            scrollElement.removeEventListener('scroll', handleWebScroll);
          }
        };
      } catch (error) {
        console.warn('Failed to set up web scroll listener:', error);
      }
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      if (cleanupFn) cleanupFn();
    };
  }, [updateQuickAccessArrows]);

  // Early return if no event info is available (after all hooks are declared)
  if (!currentEventInfo) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.text.primary }}>{t({ id: 'explore.noEvent', message: 'No event available' })}</Text>
      </View>
    );
  }
  
  // Quick Access card dimensions (matching styles)
  const cardWidth = 132;
  const cardSpacing = 10;

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  const handleQuickAccessScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const currentScrollX = contentOffset.x;
    const currentMaxScrollX = contentSize.width - layoutMeasurement.width;
    
    scrollXRef.current = currentScrollX;
    maxScrollXRef.current = currentMaxScrollX;
    viewportWidthRef.current = layoutMeasurement.width;
    contentWidthRef.current = contentSize.width;
    updateQuickAccessArrows(currentScrollX, currentMaxScrollX);
  };

  // Additional scroll handlers for better web support
  const handleQuickAccessScrollBeginDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    handleQuickAccessScroll(event);
  };

  const handleQuickAccessScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    handleQuickAccessScroll(event);
  };

  const handleQuickAccessMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    handleQuickAccessScroll(event);
  };

  const handleQuickAccessLayout = (e: any) => {
    const w = e?.nativeEvent?.layout?.width || 0;
    viewportWidthRef.current = w;
    maxScrollXRef.current = Math.max(0, contentWidthRef.current - w);
    updateQuickAccessArrows(scrollXRef.current, maxScrollXRef.current);
  };

  const handleQuickAccessContentSizeChange = (w: number, _h: number) => {
    contentWidthRef.current = w;
    maxScrollXRef.current = Math.max(0, w - viewportWidthRef.current);
    updateQuickAccessArrows(scrollXRef.current, maxScrollXRef.current);
  };


  const scrollQuickAccess = (direction: 'left' | 'right') => {
    if (!quickAccessScrollRef.current) return;
    
    // For small screens, scroll by one card at a time
    // For larger screens, scroll by viewport width minus spacing
    const scrollAmount = viewportWidthRef.current > 0 && viewportWidthRef.current > cardWidth * 2
      ? Math.min(viewportWidthRef.current - cardSpacing, cardWidth * 2)
      : cardWidth + cardSpacing;
    
    const currentScrollX = scrollXRef.current || 0;
    const target = direction === 'left' 
      ? Math.max(0, currentScrollX - scrollAmount)
      : Math.min(maxScrollXRef.current, currentScrollX + scrollAmount);
    
    // Only scroll if we're not already at the boundary
    if ((direction === 'left' && currentScrollX > 0) || 
        (direction === 'right' && currentScrollX < maxScrollXRef.current)) {
      quickAccessScrollRef.current.scrollTo({ x: target, animated: true });
    }
  };



  const handleEventSelect = (eventData: EventInfo) => {
    if (isGlobalExplorer) {
      // In global explorer, navigate to the event's home page
      if (eventData?.id && eventData?.routes?.home) {
        const route = eventData.routes.home.replace(/\/+/g, '/');
        router.push(route as any);
      } else if (eventData?.id) {
        const route = `/events/${eventData.id}/home`.replace(/\/+/g, '/');
        router.push(route as any);
      }
    } else {
      // In event-specific explorer, just update selection
      setSelectedEvent(eventData);
    }
  };

  const getEventBadgeLabel = (eventData: EventInfo): string => {
    if (eventData.tour?.role === 'hub') return 'BSL ON TOUR';
    if (eventData.tour?.role === 'archive') return 'Past Event';
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
          source={resolveEventImageSource(eventData.image) || { uri: 'https://via.placeholder.com/400x200' }}
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
        {isGlobalExplorer ? (
          /* GLOBAL EXPLORER MODE (hashpass.tech / main tenant) */
          /* Shows banner for HASHPASS platform with all events */
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
          /* EVENT-SPECIFIC EXPLORER MODE (tenant-scoped hosts like bsl.hashpass.tech) */
          /* Shows banner for the selected tenant event with countdown/live indicator */
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
              /* GLOBAL EXPLORER: Show all events in a vertical grid */
              /* Users can click any event card to navigate to that event's home page */
              <View style={styles.eventsSection}>
                <Text style={styles.sectionTitle}>
                  {t({ id: 'explore.banner.exploreAllEvents', message: 'Explore All Events' })}
                </Text>
                <Text style={styles.sectionDescription}>
                  Select an event to view details, speakers, agenda, and more
                </Text>
                <View style={styles.eventsGrid}>
                  {availableEvents.map((eventData: EventInfo, index: number) => renderEventCard(eventData, index))}
                </View>
              </View>
            ) : (
              /* EVENT-SPECIFIC EXPLORER: Show event selector if multiple events available */
              /* Tenant scopes can expose one event or an event family. */
              showEventSelector && (
                <View style={styles.eventSelectorContainer}>
                  <Text style={styles.eventSelectorTitle}>{t({ id: 'explore.selectEvent', message: 'Select Event' })}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.eventSelector}
                  >
                    {availableEvents.map((eventData: EventInfo, index: number) => renderEventCard(eventData, index))}
                  </ScrollView>
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
              />
            </CopilotView>
          </CopilotStep>
        )}

        {/* Quick Access Section - Only show for EVENT-SPECIFIC explorer */}
        {/* In global explorer, users navigate via event cards instead */}
        {!isGlobalExplorer && (
          <CopilotStep text="Quick Access cards let you quickly navigate to important sections like Speakers, Agenda, Networking Center, and Event Information. Swipe horizontally to see all options." order={9} name="quickAccess">
            <CopilotView style={styles.section}>
              <Text style={styles.sectionTitle}>{t({ id: 'explore.quickAccess', message: 'Quick Access' })}</Text>
            <View style={styles.quickAccessContainer}>
              <Reanimated.View style={[styles.scrollArrowLeft, quickAccessLeftArrowStyle]}>
                <TouchableOpacity
                  style={styles.scrollArrowButton}
                  onPress={() => scrollQuickAccess('left')}
                >
                  <MaterialIcons name="chevron-left" size={24} color={colors.primary} />
                </TouchableOpacity>
              </Reanimated.View>
              <ScrollView
                ref={quickAccessScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScroll}
                onScroll={handleQuickAccessScroll}
                onScrollBeginDrag={handleQuickAccessScrollBeginDrag}
                onScrollEndDrag={handleQuickAccessScrollEndDrag}
                onMomentumScrollEnd={handleQuickAccessMomentumScrollEnd}
                scrollEventThrottle={Platform.OS === 'web' ? 0 : 16}
                decelerationRate="fast"
                snapToInterval={cardWidth + cardSpacing}
                snapToAlignment="start"
                disableIntervalMomentum
                onLayout={handleQuickAccessLayout}
                onContentSizeChange={handleQuickAccessContentSizeChange}
                // @ts-ignore - onWheel supported in RN Web
                onWheel={handleQuickAccessWheel}
              >
                {getQuickAccessItems().map((item, index) => renderQuickAccessItem(item, index))}
              </ScrollView>
              <Reanimated.View style={[styles.scrollArrowRight, quickAccessRightArrowStyle]}>
                <TouchableOpacity
                  style={styles.scrollArrowButton}
                  onPress={() => scrollQuickAccess('right')}
                >
                  <MaterialIcons name="chevron-right" size={24} color={colors.primary} />
                </TouchableOpacity>
              </Reanimated.View>
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
