import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, ScrollView, TouchableOpacity, InteractionManager, Linking, Modal, Platform, Pressable, Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
// lib/vector-icons routes web to SVG-based Lucide icons instead of the raw
// font glyphs @expo/vector-icons renders directly; the raw font can show its
// tofu/"?" fallback glyph for a window before the icon font loads on web.
import { MaterialIcons, NativeSafeIcon } from '../../../lib/vector-icons';
import type { NativeSafeIconName } from '../../../lib/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import EventBanner from '../../../components/EventBanner';
import SpeakerAvatar from '../../../components/SpeakerAvatar';
import UnifiedSearchAndFilter from '../../../components/UnifiedSearchAndFilter';
import { apiClient, eventApiPath } from '@/lib/api-client';
import {
  getAgendaTypeColor,
  getAgendaTypeIcon,
  parseEventISO,
  formatTimeRange,
  EVENT_TZ_OFFSET,
} from '../../../types/agenda';
import type {
  AgendaType,
  AgendaItem,
} from '../../../types/agenda';
import { EVENTS } from '../../../config/events';
import { useAuth } from '../../../hooks/useAuth';
import { useToastHelpers } from '@contexts/ToastContext';
import ScheduleConfirmationModal from '../../../components/ScheduleConfirmationModal';
import AgendaActionResultModal from '../../../components/AgendaActionResultModal';
import * as Haptics from 'expo-haptics';
import { parseISO } from 'date-fns';
import LoadingScreen from '../../../components/LoadingScreen';
import { useTranslation, getCurrentLocale } from '../../../i18n/i18n';
import { Badge, IconButton, Surface } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import {
  buildGoogleCalendarUrl,
  buildICalendarFile,
  createAgendaCalendarEvent,
  resolveAgendaCalendarSpeakerNames,
} from '../../../lib/agenda-calendar';
import { parseAgendaTime } from '../../../lib/event-time';
import { getDisplayAgendaDescription } from '../../../lib/agenda-description';

// Custom filter logic for agenda items
const customAgendaFilterLogic = (
  data: AgendaItem[], 
  filters: { [key: string]: any },
  searchQuery: string
): AgendaItem[] => {
  if (!data) return [];
  
  return data.filter(item => {
    // If no filters are active, include all items
    if (!filters || Object.keys(filters).length === 0) return true;

    // Check each filter group
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value.length === 0) continue;

      switch (key) {
        case 'type':
          if (value.length > 0 && !value.includes(item.type)) {
            return false;
          }
          break;
        case 'speakers':
          if (value.length > 0 && !item.speakers?.some((speakerId: string) => 
            value.includes(speakerId)
          )) {
            return false;
          }
          break;
        case 'time':
          // Add time-based filtering logic if needed
          break;
        // Add more filter cases as needed
      }
    }

    // Handle search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = item.title?.toLowerCase().includes(query) ?? false;
      const matchesDescription = getDisplayAgendaDescription(item.description)?.toLowerCase().includes(query) ?? false;
      
      // Since we only have speaker IDs, we can only match against the ID itself
      const matchesSpeaker = item.speakers?.some((speakerId: string) =>
        speakerId.toLowerCase().includes(query)
      ) ?? false;
      
      if (!matchesTitle && !matchesDescription && !matchesSpeaker) {
        return false;
      }
    }

    return true;
  });
};

const getAgendaChronologicalValue = (
  item: AgendaItem,
  eventStartDate: string | null | undefined,
  eventTzOffset: string,
): number => {
  const parsed = parseAgendaTime(item.time, eventStartDate, item.day, eventTzOffset);
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime();

  // Some legacy programmes publish only a wall-clock value and no event date.
  const clock = String(item.time || '').match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!clock) return Number.MAX_SAFE_INTEGER;
  let hour = Number.parseInt(clock[1], 10);
  const minute = Number.parseInt(clock[2] || '0', 10);
  const meridiem = clock[3]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const formatAgendaCardTime = (item: AgendaItem, eventTzOffset: string): string => {
  const formatted = formatTimeRange(item, eventTzOffset);
  const sameMeridiem = formatted.match(/^(.+?)\s+(AM|PM)\s*-\s*(.+?)\s+\2$/i);
  if (!sameMeridiem) return formatted;
  return `${sameMeridiem[1]} – ${sameMeridiem[3]} ${sameMeridiem[2].toUpperCase()}`;
};

const EXTERNADO_VENUE_IMAGES = {
  auditorium: require('../../../assets/images/venues/externado-auditorio-principal.jpg'),
  hall: require('../../../assets/images/venues/externado-hall-principal.jpg'),
  panel: require('../../../assets/images/venues/externado-panel-central.jpg'),
} as const;

const resolveAgendaVenueImage = (
  eventId: string | undefined,
  eventVenue: string,
  location: string,
): ImageSourcePropType | null => {
  const isExternadoProgramme = eventId === 'colombia2026'
    || eventVenue.toLocaleLowerCase().includes('externado');
  if (!isExternadoProgramme) return null;

  const normalizedLocation = location.toLocaleLowerCase();
  if (normalizedLocation.includes('panel central')) return EXTERNADO_VENUE_IMAGES.panel;
  if (normalizedLocation.includes('hall principal')) return EXTERNADO_VENUE_IMAGES.hall;
  if (normalizedLocation.includes('auditorio')) return EXTERNADO_VENUE_IMAGES.auditorium;
  return null;
};

type AgendaTypeRevealProps = {
  itemId: string;
  typeColor: string;
  foregroundColor: string;
  surfaceColor: string;
  iconName: NativeSafeIconName;
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
};

const AGENDA_TYPE_REVEAL_DURATION_MS = 180;
const AGENDA_TYPE_REVEAL_COLLAPSED_WIDTH = 68;
const AGENDA_TYPE_REVEAL_EXPANDED_WIDTH = 276;
const AGENDA_TYPE_REVEAL_AUTO_COLLAPSE_MS = 3_000;

const useReducedMotionPreference = (): boolean => {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {
        if (active) setReduceMotion(true);
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};

const agendaTypeRevealStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderBottomLeftRadius: uiTokens.radius.pill,
    borderTopLeftRadius: uiTokens.radius.pill,
    borderWidth: 1,
    bottom: -1,
    justifyContent: 'center',
    height: 68,
    position: 'absolute',
    right: -1,
    boxShadow: '0 8px 18px rgba(3, 12, 24, 0.18)',
    overflow: 'hidden',
  },
  pressable: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  layer: {
    backgroundColor: uiTokens.colors.light.text,
    borderRadius: uiTokens.radius.circle,
    position: 'absolute',
    top: '50%',
    zIndex: 0,
  },
  layerRing: {
    borderRadius: uiTokens.radius.circle,
    position: 'absolute',
  },
  layerRingOuter: {
    bottom: '5%',
    left: '5%',
    right: '5%',
    top: '5%',
  },
  layerRingWhite: {
    backgroundColor: uiTokens.colors.light.canvas,
    bottom: '16%',
    left: '16%',
    right: '16%',
    top: '16%',
  },
  layerRingAccent: {
    bottom: '28%',
    left: '28%',
    right: '28%',
    top: '28%',
  },
  layerRingCenter: {
    backgroundColor: uiTokens.colors.light.canvas,
    bottom: '40%',
    left: '40%',
    right: '40%',
    top: '40%',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    flexDirection: 'row',
    gap: uiTokens.space.md,
    justifyContent: 'center',
    paddingHorizontal: uiTokens.space.lg,
    zIndex: 1,
  },
  collapsedIcon: {
    alignItems: 'center',
    bottom: -8,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    zIndex: 0,
  },
  label: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.7,
    textShadowColor: 'rgba(3, 12, 24, 0.42)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

/**
 * Hides diagnostic testIDs on production web builds (Platform.OS === 'web'
 * outside Jest) so they never ship in the real DOM, while still exposing
 * them for test queries under Jest (NODE_ENV === 'test').
 */
export function agendaTypeRevealTestId(id: string): { testID?: string } {
  return Platform.OS === 'web' && process.env.NODE_ENV !== 'test' ? {} : { testID: id };
}

function AgendaTypeReveal({
  itemId,
  typeColor,
  foregroundColor,
  surfaceColor,
  iconName,
  label,
  accessibilityLabel,
  accessibilityHint,
}: AgendaTypeRevealProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const reduceMotion = useReducedMotionPreference();
  const revealProgress = useSharedValue(0);
  const revealed = hovered || focused || pinned;

  useEffect(() => {
    const nextProgress = revealed ? 1 : 0;
    revealProgress.value = reduceMotion
      ? nextProgress
      : withTiming(nextProgress, {
          duration: AGENDA_TYPE_REVEAL_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        });
  }, [reduceMotion, revealProgress, revealed]);

  useEffect(() => {
    if (!pinned) return undefined;

    const collapseTimeout = setTimeout(
      () => setPinned(false),
      AGENDA_TYPE_REVEAL_AUTO_COLLAPSE_MS,
    );
    return () => clearTimeout(collapseTimeout);
  }, [pinned]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: revealProgress.value,
    transform: [
      { translateX: (1 - revealProgress.value) * 8 },
      { scale: 0.96 + revealProgress.value * 0.04 },
    ],
  }));
  const collapsedIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - revealProgress.value,
    transform: [{ scale: 0.92 + (1 - revealProgress.value) * 0.08 }],
  }));
  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: revealProgress.value * 5 }],
    width: AGENDA_TYPE_REVEAL_COLLAPSED_WIDTH
      + revealProgress.value * (AGENDA_TYPE_REVEAL_EXPANDED_WIDTH - AGENDA_TYPE_REVEAL_COLLAPSED_WIDTH),
  }));
  const layerStyle = useAnimatedStyle(() => {
    const diameter = 52 + revealProgress.value * 660;
    return {
      height: diameter,
      left: -26 - revealProgress.value * 150,
      marginTop: -diameter / 2,
      opacity: revealProgress.value,
      transform: [{ rotate: `${revealProgress.value * 360}deg` }],
      width: diameter,
    };
  });

  return (
    <Animated.View
      {...agendaTypeRevealTestId(`agenda-card-type-shell-${itemId}`)}
      style={[
        agendaTypeRevealStyles.container,
        {
          borderColor: `${typeColor}24`,
          backgroundColor: `${typeColor}1A`,
          boxShadow: revealed
            ? '0 5px 14px rgba(3, 12, 24, 0.16)'
            : '0 8px 18px rgba(3, 12, 24, 0.18)',
        },
        shellStyle,
      ]}
    >
      <Pressable
        testID={`agenda-card-type-watermark-${itemId}`}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ expanded: revealed }}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={() => setPinned((current) => !current)}
        style={agendaTypeRevealStyles.pressable}
      >
        <Animated.View
          {...agendaTypeRevealTestId(`agenda-card-type-layer-${itemId}`)}
          pointerEvents="none"
          style={[agendaTypeRevealStyles.layer, layerStyle]}
        >
          <View
            style={[
              agendaTypeRevealStyles.layerRing,
              agendaTypeRevealStyles.layerRingOuter,
              { backgroundColor: typeColor },
            ]}
          />
          <View
            style={[
              agendaTypeRevealStyles.layerRing,
              agendaTypeRevealStyles.layerRingWhite,
              { backgroundColor: surfaceColor },
            ]}
          />
          <View
            style={[
              agendaTypeRevealStyles.layerRing,
              agendaTypeRevealStyles.layerRingAccent,
              { backgroundColor: typeColor },
            ]}
          />
          <View
            style={[
              agendaTypeRevealStyles.layerRing,
              agendaTypeRevealStyles.layerRingCenter,
              { backgroundColor: surfaceColor },
            ]}
          />
        </Animated.View>
        <Animated.View
          {...agendaTypeRevealTestId(`agenda-card-type-collapsed-icon-${itemId}`)}
          pointerEvents="none"
          style={[agendaTypeRevealStyles.collapsedIcon, collapsedIconStyle]}
        >
          <NativeSafeIcon
            name={iconName}
            size={48}
            color={`${typeColor}52`}
            strokeWidth={2.2}
          />
        </Animated.View>
        <Animated.View
          {...agendaTypeRevealTestId(`agenda-card-type-content-${itemId}`)}
          pointerEvents="none"
          style={[agendaTypeRevealStyles.content, contentStyle]}
        >
          <NativeSafeIcon
            name={iconName}
            size={24}
            color={foregroundColor}
            strokeWidth={2.2}
          />
          <Text style={[agendaTypeRevealStyles.label, { color: foregroundColor }]}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

type AgendaTypeLegendControlProps = {
  itemKey: string;
  label: string;
  color: string;
  iconName: NativeSafeIconName;
  surfaceColor: string;
  borderColor: string;
  textColor: string;
};

const AGENDA_TYPE_LEGEND_SIZE = uiTokens.control.compactHeight - uiTokens.space.sm - uiTokens.space.xs;
const AGENDA_TYPE_LEGEND_COLLAPSED_WIDTH = AGENDA_TYPE_LEGEND_SIZE;
const AGENDA_TYPE_LEGEND_LABEL_WIDTH = 76;

const agendaTypeLegendControlStyles = StyleSheet.create({
  shell: {
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    height: AGENDA_TYPE_LEGEND_SIZE,
    overflow: 'hidden',
  },
  pressable: {
    alignItems: 'center',
    flexDirection: 'row',
    height: '100%',
  },
  icon: {
    alignItems: 'center',
    height: AGENDA_TYPE_LEGEND_SIZE,
    justifyContent: 'center',
    width: AGENDA_TYPE_LEGEND_COLLAPSED_WIDTH - uiTokens.control.borderWidth * 2,
  },
  labelClip: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    fontSize: uiTokens.type.caption,
    fontWeight: '700',
    paddingRight: uiTokens.space.xs,
  },
});

function AgendaTypeLegendControl({
  itemKey,
  label,
  color,
  iconName,
  surfaceColor,
  borderColor,
  textColor,
}: AgendaTypeLegendControlProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const reduceMotion = useReducedMotionPreference();
  const expansion = useSharedValue(0);
  const expanded = hovered || focused || pinned;

  useEffect(() => {
    const nextProgress = expanded ? 1 : 0;
    expansion.value = reduceMotion
      ? nextProgress
      : withTiming(nextProgress, {
          duration: uiTokens.motion.fast,
          easing: Easing.out(Easing.cubic),
        });
  }, [expanded, expansion, reduceMotion]);

  const shellStyle = useAnimatedStyle(() => ({
    width: AGENDA_TYPE_LEGEND_COLLAPSED_WIDTH
      + expansion.value * AGENDA_TYPE_LEGEND_LABEL_WIDTH,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: expansion.value,
    width: expansion.value * AGENDA_TYPE_LEGEND_LABEL_WIDTH,
  }));

  return (
    <Animated.View
      style={[
        agendaTypeLegendControlStyles.shell,
        {
          backgroundColor: expanded ? `${color}14` : surfaceColor,
          borderColor: expanded ? `${color}52` : borderColor,
        },
        shellStyle,
      ]}
    >
      <Pressable
        testID={`agenda-type-legend-${itemKey}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={() => setPinned((current) => !current)}
        style={agendaTypeLegendControlStyles.pressable}
      >
        <View style={agendaTypeLegendControlStyles.icon}>
          <NativeSafeIcon
            name={iconName}
            size={16}
            color={color}
            strokeWidth={2.2}
          />
        </View>
        <Animated.View style={[agendaTypeLegendControlStyles.labelClip, labelStyle]}>
          <Text numberOfLines={1} style={[agendaTypeLegendControlStyles.label, { color: textColor }]}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

export default function BSL2025AgendaScreen() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const interfaceMode = isDark ? 'dark' : 'light';
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string; scrollTo?: string; day?: string }>();
  const styles = getStyles(isDark, colors);
  const { user, retryDatabaseSession } = useAuth();
  // The event's own fixed timezone (e.g. Chile is -04:00), not the hardcoded
  // -05:00 Medellín-hub default that EVENT_TZ_OFFSET falls back to. Times
  // must render in this offset regardless of the viewer's device/browser
  // timezone.
  const eventTzOffset = event?.eventStartDate?.match(/([+-]\d{2}:?\d{2})$/)?.[1] || EVENT_TZ_OFFSET;
  const { showSuccess, showError, showWarning } = useToastHelpers();
  const { t } = useTranslation('agenda');
  const scrollViewRef = useRef<ScrollView>(null);
  const sessionItemRefs = useRef<{ [key: string]: View | null }>({});
  const handledSessionRef = useRef<string | null>(null); // Track which session we've already handled
  const agendaLoadRequestRef = useRef(0);

  const [agendaByDay, setAgendaByDay] = useState<{ [key: string]: AgendaItem[] }>({});
  const [activeTab, setActiveTab] = useState<string>('Day 1 - November 12'); // Default to Day 1
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const hasSetInitialTabRef = useRef(false); // Track if we've set initial tab
  const userSelectedTabRef = useRef(false); // Track if user manually selected a tab
  const [isLive, setIsLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<AgendaType | 'all'>('all');
  const [agendaLayout, setAgendaLayout] = useState<'compact' | 'list' | 'grid'>('compact');
  const [expandedAgendaAction, setExpandedAgendaAction] = useState<string | null>(null);
  const agendaActionHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompactAgenda = agendaLayout === 'compact';
  const isAgendaGrid = agendaLayout === 'grid';
  const [usingJsonFallback, setUsingJsonFallback] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');
  const [isEventPeriod, setIsEventPeriod] = useState(false);
  const [isEventFinished, setIsEventFinished] = useState(false);
  const [filteredAgenda, setFilteredAgenda] = useState<AgendaItem[]>([]);
  const [showNotLiveDetails, setShowNotLiveDetails] = useState(false);
  const [userAgendaStatus, setUserAgendaStatus] = useState<Record<string, 'tentative' | 'confirmed'>>({});
  const [favoriteStatus, setFavoriteStatus] = useState<Record<string, boolean>>({});
  const [confirmationModal, setConfirmationModal] = useState<{
    visible: boolean;
    agendaItem: AgendaItem | null;
    startTime: Date | null;
  }>({ visible: false, agendaItem: null, startTime: null });
  const [isConfirming, setIsConfirming] = useState(false);
  const [agendaActionResult, setAgendaActionResult] = useState<{ visible: boolean; added: boolean; slotStartTime: Date | null }>({
    visible: false,
    added: true,
    slotStartTime: null,
  });

  const clearAgendaActionHoverTimeout = useCallback(() => {
    if (agendaActionHoverTimeoutRef.current) {
      clearTimeout(agendaActionHoverTimeoutRef.current);
      agendaActionHoverTimeoutRef.current = null;
    }
  }, []);

  const handleAgendaActionHoverIn = useCallback((actionId: string) => {
    clearAgendaActionHoverTimeout();
    setExpandedAgendaAction(actionId);
  }, [clearAgendaActionHoverTimeout]);

  const handleAgendaActionHoverOut = useCallback((actionId: string) => {
    clearAgendaActionHoverTimeout();
    agendaActionHoverTimeoutRef.current = setTimeout(() => {
      setExpandedAgendaAction((current) => current === actionId ? null : current);
      agendaActionHoverTimeoutRef.current = null;
    }, uiTokens.motion.fast);
  }, [clearAgendaActionHoverTimeout]);

  useEffect(() => clearAgendaActionHoverTimeout, [clearAgendaActionHoverTimeout]);
  // Calendar export is intentionally a secondary, per-session action. Keeping
  // the choice in a modal preserves the agenda card's scan-friendly layout.
  const [calendarPickerItem, setCalendarPickerItem] = useState<AgendaItem | null>(null);
  const [speakerMapRef, setSpeakerMapRef] = useState<Map<string, { id: string; name: string; image?: string }>>(new Map());
  const eventId = event?.id || 'bsl';
  const agendaApiPath = eventApiPath(eventId, 'agenda');
  const agendaStatusApiPath = eventApiPath(eventId, 'agenda/status');
  const eventDateLabel = event?.eventDateString || event?.subtitle || 'Tour 2026';
  const eventLocationLabel = event?.tour?.city && event?.tour?.country
    ? `${event.tour.city}, ${event.tour.country}`
    : event?.subtitle || 'Latin America';
  const eventVenueLabel = event?.tour?.venue || eventLocationLabel;

  const createCalendarEvent = (item: AgendaItem) => {
    if (!event?.eventStartDate) {
      throw new Error(t('calendar.unavailable', 'This session does not have a calendar-ready event date yet.'));
    }

    const origin = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://hashpass.tech';
    const itemLocation = item.location ||
      (item.type === 'keynote' ? t('locations.mainStage') :
        item.type === 'registration' ? t('locations.registrationArea') : eventVenueLabel);

    return createAgendaCalendarEvent({
      eventId,
      eventName: event.name,
      eventStartDate: event.eventStartDate,
      eventTimezoneOffset: eventTzOffset,
      agendaUrl: `${origin}/events/${encodeURIComponent(eventId)}/agenda?session=${encodeURIComponent(item.id)}`,
      item: {
        ...item,
        location: itemLocation,
        speakers: resolveAgendaCalendarSpeakerNames(
          item.speakers,
          (speakerReference: string) => resolveAgendaSpeaker(speakerReference).displayName,
        ),
      },
    });
  };

  const handleAddToGoogleCalendar = async (item: AgendaItem) => {
    try {
      await Linking.openURL(buildGoogleCalendarUrl(createCalendarEvent(item)));
    } catch (error) {
      console.error('Unable to open Google Calendar:', error);
      showError(t('messages.error', 'Error'), t('calendar.googleError', 'Unable to open Google Calendar. Please try again.'));
    }
  };

  const handleExportCalendarFile = async (item: AgendaItem) => {
    try {
      const calendarEvent = createCalendarEvent(item);
      const contents = buildICalendarFile(calendarEvent);
      const filename = `hashpass-${eventId}-${item.id}.ics`.replace(/[^a-z0-9._-]/gi, '-');

      if (Platform.OS === 'web') {
        const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        return;
      }

      // Native uses the operating system's share sheet. This lets the person
      // choose Apple Calendar, Outlook, Samsung Calendar, or any installed
      // app that supports the portable iCalendar standard.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const FileSystem = require('expo-file-system');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sharing = require('expo-sharing');
      const canShare = await Sharing.isAvailableAsync();
      const directory = FileSystem.cacheDirectory as string | null;
      if (!canShare || !directory) {
        throw new Error('Calendar file sharing is unavailable on this device.');
      }

      const fileUri = `${directory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, contents);
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/calendar',
        UTI: 'com.apple.icalendar',
        dialogTitle: t('calendar.shareTitle', 'Add to calendar'),
      });
    } catch (error) {
      console.error('Unable to export calendar event:', error);
      showError(t('messages.error', 'Error'), t('calendar.exportError', 'Unable to create a calendar file. Please try again.'));
    }
  };

  const handleCalendarPickerAction = async (action: 'google' | 'ics') => {
    const item = calendarPickerItem;
    if (!item) return;

    setCalendarPickerItem(null);
    if (action === 'google') {
      await handleAddToGoogleCalendar(item);
      return;
    }
    await handleExportCalendarFile(item);
  };

  // Helper functions used in effects and render
  const checkEventPeriod = () => {
    const now = new Date();
    const start = event?.eventStartDate ? new Date(event.eventStartDate) : null;
    const end = event?.eventEndDate ? new Date(event.eventEndDate) : null;
    setIsEventPeriod(Boolean(start && end && now >= start && now <= end));
    setIsEventFinished(Boolean(end && now > end));
  };

  const getTabLabel = (dayKey: string) => {
    // Expect keys like "Day 1 - November 12"
    const parts = dayKey.split(' - ');
    const rawLabel = parts[0] || dayKey;
    const dayNumberMatch = rawLabel.match(/(\d+)/);
    return dayNumberMatch ? t('tabs.day', { number: dayNumberMatch[1] }) : rawLabel;
  };

  const getTabTheme = (dayKey: string) => {
    const dayNumberMatch = dayKey.match(/Day (\d+)/);
    const dayNumber = dayNumberMatch?.[1];

    // Prefer this event's own published day theme (see chile2026's
    // dayThemes in packages/config/src/events.ts) over the generic
    // fallback copy, which was previously the original bsl2025 hub
    // event's themes shown for every tour-stop event regardless of which
    // one was actually open.
    const eventTheme = dayNumber ? (event as any)?.dayThemes?.[dayNumber] : undefined;
    if (eventTheme) {
      const locale = getCurrentLocale();
      return eventTheme[locale] || eventTheme.en || eventTheme.es || '';
    }

    if (dayKey.includes('Day 1')) return t('tabs.themes.day1');
    if (dayKey.includes('Day 2')) return t('tabs.themes.day2');
    if (dayKey.includes('Day 3')) return t('tabs.themes.day3');
    return '';
  };

  // Filters for UnifiedSearchAndFilter
  const filterGroups = [
    {
      key: 'type',
      label: t('filter.type'),
      type: 'single' as const,
      options: [
        { key: 'keynote', label: t('filter.keynote'), icon: 'mic', color: getAgendaTypeColor('keynote') },
        { key: 'panel', label: t('filter.panel'), icon: 'group', color: getAgendaTypeColor('panel') },
        { key: 'workshop', label: t('filter.workshop'), icon: 'build', color: getAgendaTypeColor('workshop') },
        { key: 'networking', label: t('filter.networking'), icon: 'people', color: getAgendaTypeColor('networking') },
        { key: 'break', label: t('filter.break'), icon: 'free-breakfast', color: getAgendaTypeColor('break') },
        { key: 'meal', label: t('filter.meal'), icon: 'restaurant', color: getAgendaTypeColor('meal') },
        { key: 'registration', label: t('filter.registration'), icon: 'person-add', color: getAgendaTypeColor('registration') },
      ],
    },
  ];

  const filterAgendaItems = (items: AgendaItem[], filters: { search?: string; type?: AgendaType | 'all'; speakers?: string }) => {
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter((it: AgendaItem) =>
        it.title.toLowerCase().includes(q) ||
        (it.description && it.description.toLowerCase().includes(q)) ||
        (it.type && it.type.toLowerCase().includes(q)) ||
        ((it.speakers || []).some((s: string) => s.toLowerCase().includes(q)))
      );
    }
    if (filters?.type) {
      items = items.filter((it) => it.type === filters.type);
    }
    return items;
  };

  // Load agenda from the database, with the published event schedule as a
  // fallback. A route/tenant transition can briefly issue two requests; only
  // the latest response may update the screen.
  const loadAgenda = useCallback(async () => {
    if (!event) return;

    const requestId = ++agendaLoadRequestRef.current;
    const isCurrentRequest = () => agendaLoadRequestRef.current === requestId;

    setLoading(true);
    setUsingJsonFallback(false);
    setServiceStatus('unknown');

    try {
      let agendaData: AgendaItem[] = [];

      try {
        const response = await apiClient.request(agendaApiPath, {
          skipEventSegment: true,
        });

        if (!isCurrentRequest()) return;

        if (Array.isArray(response)) {
          agendaData = response;
        } else if (Array.isArray(response?.data)) {
          agendaData = response.data;
        } else if (Array.isArray(response?.data?.data)) {
          agendaData = response.data.data;
        }
      } catch {
        if (!isCurrentRequest()) return;
      }

      if (!isCurrentRequest()) return;

      if (agendaData.length > 0) {
        setAgenda(agendaData);
        setIsLive(true);
        setServiceStatus('running');
        return;
      }

      const fallbackAgenda = event.agenda || EVENTS[eventId as keyof typeof EVENTS]?.agenda || [];
      setAgenda(fallbackAgenda);
      setIsLive(false);
      setUsingJsonFallback(true);
      setServiceStatus('stopped');
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [agendaApiPath, event, eventId]);

  useEffect(() => {
    if (!event) return;

    void loadAgenda();
    return () => {
      agendaLoadRequestRef.current += 1;
    };
  }, [event, loadAgenda]);

  // Ensure filteredAgenda is populated when agenda loads
  useEffect(() => {
    if (agenda && agenda.length > 0) {
      setFilteredAgenda(agenda);
    } else {
      setFilteredAgenda([]);
    }
  }, [agenda]);

  // Load speakers from database and build a map for both database IDs and config slugs
  useEffect(() => {
    if (!event) return;

    let cancelled = false;

    const loadSpeakersMap = async () => {
      try {
        const map = new Map<string, { id: string; name: string; image?: string }>();

        // Add speakers from event config (by slug)
        if (event?.speakers && Array.isArray(event.speakers)) {
          event.speakers.forEach((speaker: any) => {
            if (speaker.id) {
              const speakerRecord = {
                id: speaker.id,
                name: speaker.name,
                image: speaker.image,
              };
              map.set(speaker.id, speakerRecord);
              if (speaker.name) map.set(speaker.name, speakerRecord);
            }
          });
        }

        // Fetch and add speakers from the event API (by UUID).
        try {
          const response = await apiClient.request(eventApiPath(eventId, 'speakers'), {
            skipEventSegment: true,
          });
          if (!response.success) throw new Error(response.error);
          const dbSpeakers = (response.data as any)?.data || [];

          if (Array.isArray(dbSpeakers)) {
            dbSpeakers.forEach((speaker: any) => {
              if (speaker.id) {
                const existingSpeaker = map.get(speaker.id) || map.get(speaker.name);
                const speakerRecord = {
                  id: speaker.id,
                  name: speaker.name,
                  // Keep the configured portrait until the directory owns a real one.
                  image: speaker.imageurl || speaker.image_url || speaker.image || existingSpeaker?.image,
                };
                map.set(speaker.id, speakerRecord);
                if (speaker.name) map.set(speaker.name, speakerRecord);
              }
            });
          }
        } catch (e) {
          console.error('Failed to load database speakers:', e);
          // Continue with config speakers only
        }

        if (!cancelled) {
          setSpeakerMapRef(map);
        }
      } catch (e) {
        console.error('Error building speaker map:', e);
      }
    };

    void loadSpeakersMap();

    return () => {
      cancelled = true;
    };
  }, [event, eventId]);

  // Check if we're in the event period and if event is finished
  useEffect(() => {
    checkEventPeriod();
    // Check periodically (every minute) to update finished status
    const interval = setInterval(() => {
      checkEventPeriod();
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh agenda every 5 minutes during event period (silent, no UI)
  useEffect(() => {
    if (!isLive || !isEventPeriod) return;

    const updateInterval = 5 * 60 * 1000; // 5 minutes in milliseconds

    const refreshTimer = setInterval(() => {
      const refreshAgenda = async () => {
        try {
          const response = await apiClient.request(agendaApiPath, {
            skipEventSegment: true,
          });
          if (response.success && response.data) {
            let agendaData: any[] = [];
            if (Array.isArray(response.data)) {
              agendaData = response.data;
            } else if (response.data.data && Array.isArray(response.data.data)) {
              agendaData = response.data.data;
            }
            if (agendaData.length > 0) {
              setAgenda(agendaData);
            }
          }
        } catch (error) {
          console.error('Auto-refresh failed:', error);
        }
      };
      refreshAgenda();
    }, updateInterval);

    return () => clearInterval(refreshTimer);
  }, [isLive, isEventPeriod, agendaApiPath]);

  // Group agenda by day
  useEffect(() => {
    if (loading) return;
    
    if (agenda.length === 0) {
      // No agenda data - clear the grouped data
      setAgendaByDay({});
      return;
    }
    
    const grouped: { [key: string]: AgendaItem[] } = {};
    
    // Check if agenda items have day information from database
    const hasDayInfo = agenda.some(item => (item as any).day);
    
    if (hasDayInfo) {
      // Group by day column from database
      // Check if the day values are simple (1, 2, 3) or complex (with thematic names)
      // Group by day, handling both simple and complex day names. dayKey is
      // purely an internal grouping/react-key value here -- it's never
      // rendered directly (getTabLabel/getTabTheme derive the displayed,
      // translated text from it), so the hardcoded "November N" isn't
      // user-visible; left as-is to avoid touching this key's format, which
      // several other places in this file pattern-match against.
      agenda.forEach(item => {
        const day = (item as any).day;
        if (day) {
          let dayKey: string;

          // Extract day number from complex day names
          if (day.includes('Día 1')) {
            dayKey = 'Day 1 - November 12';
          } else if (day.includes('Día 2')) {
            dayKey = 'Day 2 - November 13';
          } else if (day.includes('Día 3')) {
            dayKey = 'Day 3 - November 14';
          } else if (day === '1' || day === '2' || day === '3') {
            // Simple day numbers
            dayKey = `Day ${day} - November ${day === '1' ? '12' : day === '2' ? '13' : '14'}`;
          } else {
            // Fallback for other formats
            dayKey = day;
          }

          if (!grouped[dayKey]) {
            grouped[dayKey] = [];
          }
          grouped[dayKey].push(item);
        }
      });
      
      // Also handle items without day information
      const itemsWithoutDay = agenda.filter(item => !(item as any).day);
      if (itemsWithoutDay.length > 0) {
        // Distribute items without day info across the days
        const dayKeys = Object.keys(grouped).sort();
        if (dayKeys.length > 0) {
          itemsWithoutDay.forEach((item, index) => {
            const targetDay = dayKeys[index % dayKeys.length];
            grouped[targetDay].push(item);
          });
        } else {
          // If no days exist yet, create them from the items without day info
          const day1Items = itemsWithoutDay.slice(0, Math.ceil(itemsWithoutDay.length / 3));
          const day2Items = itemsWithoutDay.slice(Math.ceil(itemsWithoutDay.length / 3), Math.ceil(itemsWithoutDay.length * 2 / 3));
          const day3Items = itemsWithoutDay.slice(Math.ceil(itemsWithoutDay.length * 2 / 3));
          
          if (day1Items.length > 0) {
            grouped['Day 1 - November 12'] = day1Items;
          }
          if (day2Items.length > 0) {
            grouped['Day 2 - November 13'] = day2Items;
          }
          if (day3Items.length > 0) {
            grouped['Day 3 - November 14'] = day3Items;
          }
        }
      }
      
    } else {
      // Fallback: distribute sessions across 3 days
      const day1Items = agenda.slice(0, 4); // First 4 items for Day 1
      const day2Items = agenda.slice(4, 8); // Next 4 items for Day 2
      const day3Items = agenda.slice(8); // Remaining items for Day 3
      
      // Add Day 1 items
      if (day1Items.length > 0) {
        grouped['Day 1 - November 12'] = day1Items;
      }
      
      // Add Day 2 items
      if (day2Items.length > 0) {
        grouped['Day 2 - November 13'] = day2Items;
      }
      
      // Add Day 3 items
      if (day3Items.length > 0) {
        grouped['Day 3 - November 14'] = day3Items;
      }
      
    }

    // Sort items within each day by start time (supports DB ISO times)
    Object.keys(grouped).forEach(day => {
      grouped[day].sort((a, b) => {
        return getAgendaChronologicalValue(a, event?.eventStartDate, eventTzOffset)
          - getAgendaChronologicalValue(b, event?.eventStartDate, eventTzOffset);
      });
    });

    // Sort days in correct order (Day 1, Day 2, Day 3)
    const sortedGrouped: { [key: string]: AgendaItem[] } = {};
    const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
    
    dayOrder.forEach(dayKey => {
      if (grouped[dayKey]) {
        sortedGrouped[dayKey] = grouped[dayKey];
      }
    });

    setAgendaByDay(sortedGrouped);
    
    // Set first tab as active (Day 1) - only on initial load:
    // 1. We're not navigating from banner (no params.session)
    // 2. We haven't set initial tab yet
    // 3. User hasn't manually selected a tab
    // 4. Current activeTab doesn't exist in the new grouped data (only if it's the initial default)
    // This prevents overriding user's manual tab selection or session navigation
    const availableTabs = Object.keys(sortedGrouped);
    const currentTabExists = activeTab && availableTabs.includes(activeTab);
    
    // NEVER override if user manually selected a tab
    if (userSelectedTabRef.current && currentTabExists) {
      return; // Don't change anything if user selected it
    }
    
    // Only set initial tab if:
    // - No session navigation in progress
    // - User hasn't manually selected a tab
    // - Haven't set initial tab yet
    // - Current tab doesn't exist (meaning it's the default and needs to be set)
    if (!params.session && !handledSessionRef.current && !hasSetInitialTabRef.current && !userSelectedTabRef.current && !currentTabExists && availableTabs.length > 0) {
      // Always prioritize Day 1, then Day 2, then Day 3 - use dayOrder to ensure correct order
      const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
      const tabToSelect = dayOrder.find(dayKey => sortedGrouped[dayKey] && sortedGrouped[dayKey].length > 0) || availableTabs[0];
      
      if (tabToSelect) {
        setActiveTab(tabToSelect);
        hasSetInitialTabRef.current = true;
      }
    } else if (currentTabExists && !hasSetInitialTabRef.current && !userSelectedTabRef.current) {
      // Tab already exists and is valid, mark as set so we don't override it
      // This handles the case where the default tab already exists in the grouped data
      // BUT: if it's not Day 1 and we haven't set initial tab yet, force Day 1
      if (activeTab !== 'Day 1 - November 12' && sortedGrouped['Day 1 - November 12']) {
        setActiveTab('Day 1 - November 12');
        hasSetInitialTabRef.current = true;
      } else {
        hasSetInitialTabRef.current = true;
      }
    }
  }, [activeTab, agenda, loading, event?.eventStartDate, eventTzOffset, params.session]);

  // Effect to handle scrolling to a specific session when clicking from banner
  useEffect(() => {
    // Only run if we have both session and scrollTo params
    if (!params.session || !params.scrollTo || Object.keys(agendaByDay).length === 0) {
      // Only reset handledSessionRef if params are actually cleared (not just initial load)
      if (!params.session && !params.scrollTo) {
        handledSessionRef.current = null;
        // Don't reset hasSetInitialTabRef - user might have manually selected a tab
      }
      return;
    }

    const sessionId = String(params.session); // Ensure it's a string
    
    // Skip if we've already handled this exact session and we're on the correct tab
    if (handledSessionRef.current === sessionId && activeTab) {
      // Double-check we're on the right tab
      let foundDay: string | null = null;
      for (const dayKey in agendaByDay) {
        const dayItems = agendaByDay[dayKey];
        if (dayItems.some(item => String(item.id) === sessionId)) {
          foundDay = dayKey;
          break;
        }
      }
      if (foundDay === activeTab) {
        return; // Already handled and on correct tab
      }
    }
    
    // Find which day contains this session
    // First, check if day was provided in URL params (from AgendaTracker)
    let sessionDayKey: string | null = null;
    let foundItem: AgendaItem | null = null;
    
    if (params.day) {
      // Use the day from URL params if provided (more reliable)
      const providedDay = decodeURIComponent(params.day);
      if (agendaByDay[providedDay]) {
        // Verify the session exists in this day
        const dayItems = agendaByDay[providedDay];
        foundItem = dayItems.find(item => {
          const itemIdStr = String(item.id);
          const sessionIdStr = String(sessionId);
          return itemIdStr === sessionIdStr || 
                 itemIdStr === String(Number(sessionIdStr)) ||
                 String(Number(itemIdStr)) === sessionIdStr ||
                 Number(itemIdStr) === Number(sessionIdStr);
        }) || null;
        
        if (foundItem) {
          sessionDayKey = providedDay;
        }
      }
    }
    
    // If not found using provided day, search in correct order (Day 1, Day 2, Day 3)
    if (!sessionDayKey) {
      const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
      
      // First, try searching in the ordered days
      for (const dayKey of dayOrder) {
        if (!agendaByDay[dayKey]) continue;
        
        const dayItems = agendaByDay[dayKey];
        foundItem = dayItems.find(item => {
          // Try multiple ID comparison methods
          const itemIdStr = String(item.id);
          const sessionIdStr = String(sessionId);
          const matches = itemIdStr === sessionIdStr || 
                          itemIdStr === String(Number(sessionIdStr)) ||
                          String(Number(itemIdStr)) === sessionIdStr ||
                          Number(itemIdStr) === Number(sessionIdStr);
          return matches;
        }) || null;
        
        if (foundItem) {
          sessionDayKey = dayKey;
          break;
        }
      }
      
      // If not found in ordered days, try all days as fallback
      if (!sessionDayKey) {
        for (const dayKey in agendaByDay) {
          if (dayOrder.includes(dayKey)) continue; // Already searched
          
          const dayItems = agendaByDay[dayKey];
          foundItem = dayItems.find(item => {
            const itemIdStr = String(item.id);
            const sessionIdStr = String(sessionId);
            return itemIdStr === sessionIdStr || 
                   itemIdStr === String(Number(sessionIdStr)) ||
                   String(Number(itemIdStr)) === sessionIdStr ||
                   Number(itemIdStr) === Number(sessionIdStr);
          }) || null;
          
          if (foundItem) {
            sessionDayKey = dayKey;
            break;
          }
        }
      }
    }

    if (!sessionDayKey) {
      console.error(`❌ Session with ID ${sessionId} not found in agenda!`);
      console.error(`📋 Available session IDs by day:`, 
        Object.entries(agendaByDay).map(([day, items]) => ({
          day,
          ids: items.map(item => ({ id: item.id, title: item.title?.substring(0, 30) }))
        }))
      );
      return;
    }

    // Set the active tab to the session's day if it's different
    if (activeTab !== sessionDayKey) {
      setActiveTab(sessionDayKey);
      // Don't mark as handled yet - wait until we're on the correct tab
      // Return early - the effect will run again when activeTab changes
      return;
    }

    // We're on the correct tab, mark as handling and proceed to scroll
    handledSessionRef.current = sessionId;

    // Function to attempt scrolling
    const attemptScroll = (attemptNumber: number = 1, maxAttempts: number = 5) => {
      const sessionRef = sessionItemRefs.current[sessionId];
      
      if (!sessionRef) {
        if (attemptNumber < maxAttempts) {
          // Retry with exponential backoff
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 200 * attemptNumber);
        } else {
          console.error(`[Scroll] Failed to find session ref after ${maxAttempts} attempts`);
        }
        return;
      }
      
      if (!scrollViewRef.current) {
        if (attemptNumber < maxAttempts) {
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 200 * attemptNumber);
        }
        return;
      }

      // Use measureLayout to get the position of the session item
      try {
        sessionRef.measureLayout(
          scrollViewRef.current as any,
          (_x, y, _width, _height) => {
            // Calculate scroll position with proper offset
            // Account for header, tabs, and search bar
            const headerOffset = 150; // Approximate header + tabs height
            const scrollY = Math.max(0, y - headerOffset);
            
            scrollViewRef.current?.scrollTo({ 
              y: scrollY,
              animated: true 
            });
            
            // Clear URL parameters after scrolling to prevent re-triggering
            setTimeout(() => {
              router.replace(`/events/${eventId}/agenda`);
            }, 1000);
          },
          () => {
            console.error(`[Scroll] Error measuring session layout (attempt ${attemptNumber})`);
            if (attemptNumber < maxAttempts) {
              // Retry with exponential backoff
              setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 300 * attemptNumber);
            } else {
              console.error(`[Scroll] Failed to measure layout after ${maxAttempts} attempts`);
            }
          }
        );
      } catch (error) {
        console.error(`[Scroll] Exception during measureLayout (attempt ${attemptNumber}):`, error);
        if (attemptNumber < maxAttempts) {
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 300 * attemptNumber);
        }
      }
    };

    // Wait for layout to render after tab is set
    // Use InteractionManager to wait for all interactions to complete
    let timeoutId: NodeJS.Timeout | null = null;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      // Additional delay to ensure DOM is fully rendered
      timeoutId = setTimeout(() => {
        attemptScroll(1, 5);
      }, 600); // Increased from 400ms to 600ms
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (interactionHandle) {
        interactionHandle.cancel();
      }
    };
  }, [params.session, params.scrollTo, agendaByDay, activeTab]); // Removed router to prevent infinite loops

  // Function to clean session titles by removing type prefixes
  const cleanSessionTitle = (title: string) => {
    // Remove common session type prefixes
    return title
      .replace(/^Keynote\s*–\s*/i, '')
      .replace(/^Panel\s*–\s*/i, '')
      .replace(/^Panel\s*\([^)]+\)\s*–\s*/i, '')
      .replace(/^Break\s*–\s*/i, '')
      .replace(/^Meal\s*–\s*/i, '')
      .replace(/^Registration\s*–\s*/i, '')
      .trim();
  };

  // Resolves an agenda item's speaker reference to both a display name and a
  // navigable speaker id. Newer tour-stop events (packages/config/src/
  // events.ts's chile2026/peru2026/colombia2026 agenda data) reference
  // speakers by id slug (e.g. 'alvaro-clarke'), not display name -- the
  // original name-substring match below predates that and was silently
  // failing for id-slug references (a hyphenated, unaccented slug rarely
  // substring-matches an accented display name), which is why agenda cards
  // were rendering the raw id slug as if it were the speaker's name.
  // When the backend speaker directory returns database rows, supplement the map with both
  // database UUIDs and event.speakers config slugs.
  const resolveAgendaSpeaker = (
    value: string
  ): { id: string | null; displayName: string; image?: string } => {
    // First, try the combined map (config + database speakers)
    const mapEntry = speakerMapRef.get(value);
    if (mapEntry) {
      return { id: mapEntry.id, displayName: mapEntry.name, image: mapEntry.image };
    }

    // Fallback: search by name in event.speakers
    if (event?.speakers) {
      const byName = event.speakers.find((s: { name: string }) =>
        s.name.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(s.name.toLowerCase())
      );
      if (byName?.id) return { id: byName.id, displayName: byName.name, image: byName.image };
    }

    return { id: null, displayName: value };
  };

  // Function to find speaker ID by name (synchronous check first)
  const findSpeakerId = (speakerName: string): string | null => resolveAgendaSpeaker(speakerName).id;

  // Function to handle speaker navigation
  const handleSpeakerPress = async (speakerName: string) => {
    // First try synchronous lookup
    let speakerId = findSpeakerId(speakerName);
    
    // If not found, ask the backend directory search.
    if (!speakerId) {
      try {
        const response = await apiClient.request(eventApiPath(eventId, 'speakers'), {
          skipEventSegment: true,
          params: { search: speakerName },
        });
        const data = (response.data as any)?.data;
        if (response.success && Array.isArray(data) && data[0]?.id) speakerId = data[0].id;
      } catch (e) {
        // Ignore errors
      }
    }
    
    if (speakerId) {
      router.push(`/events/${eventId}/speakers/${speakerId}`);
    }
  };

  // Load user agenda status and favorites
  useEffect(() => {
    const loadUserAgendaStatus = async () => {
      if (!user) {
        setUserAgendaStatus({});
        setFavoriteStatus({});
        return;
      }
      try {
        // Native Better Auth may be authenticated before its Supabase bearer
        // is available. Refresh it before personal agenda reads/writes.
        await retryDatabaseSession?.();
        const response = await apiClient.request(agendaStatusApiPath, {
          skipEventSegment: true,
        });

        if (!response.success) {
          console.error('Error loading user agenda status:', response.error);
          return;
        }

        const data = (response.data as any)?.data;
        const statusMap: Record<string, 'tentative' | 'confirmed'> = {};
        const favoriteMap: Record<string, boolean> = {};

        (data || []).forEach((item: any) => {
          if (item.agenda_id) {
            const status = item.status === 'unconfirmed' ? 'tentative' : item.status;
            statusMap[item.agenda_id] = status as 'tentative' | 'confirmed';
            if (item.is_favorite) favoriteMap[item.agenda_id] = true;
          }
        });
        
        setUserAgendaStatus(statusMap);
        setFavoriteStatus(favoriteMap);
      } catch (e) {
        console.error('Error loading user agenda status:', e);
      }
    };

    loadUserAgendaStatus();
  }, [user, eventId, agendaStatusApiPath, retryDatabaseSession]);

  // Handle toggle confirmation
  /* istanbul ignore next -- exercised through the native/web agenda interaction flow */
  const handleToggleConfirmation = async (
    agendaItem: AgendaItem,
    startTime: Date,
    requestedStatus?: 'tentative' | 'confirmed',
  ) => {
    if (!user) {
      showError(t('messages.error', 'Error'), t('messages.signInToManageAgenda', 'Sign in to manage your agenda'));
      return;
    }
    
    setIsConfirming(true);
    const currentStatus = userAgendaStatus[agendaItem.id] || 'tentative';
    const newStatus = requestedStatus ?? (currentStatus === 'confirmed' ? 'tentative' : 'confirmed');
    
    try {
      await retryDatabaseSession?.();
      const response = await apiClient.request(agendaStatusApiPath, {
        skipEventSegment: true,
        method: 'POST',
        body: { agendaId: agendaItem.id, status: newStatus },
      });
      if (!response.success) throw new Error(response.error);

      setUserAgendaStatus(prev => ({
        ...prev,
        [agendaItem.id]: newStatus,
      }));

      setConfirmationModal({ visible: false, agendaItem: null, startTime: null });
      setAgendaActionResult({ visible: true, added: newStatus === 'confirmed', slotStartTime: startTime });
    } catch (error) {
      console.error('Error toggling confirmation:', error);
      showError(t('messages.error'), newStatus === 'confirmed' ? t('messages.confirmError') : t('messages.unconfirmError'));
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle toggle favorite
  /* istanbul ignore next -- exercised through the native/web agenda interaction flow */
  const handleToggleFavorite = async (agendaItem: AgendaItem) => {
    if (!user) {
      showError(t('messages.error', 'Error'), t('messages.signInToManageFavorites', 'Sign in to manage your favorites'));
      return;
    }
    
    const currentFavorite = favoriteStatus[agendaItem.id] || false;
    const newFavorite = !currentFavorite;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await retryDatabaseSession?.();
      const response = await apiClient.request(agendaStatusApiPath, {
        skipEventSegment: true,
        method: 'POST',
        body: { agendaId: agendaItem.id, isFavorite: newFavorite },
      });
      if (!response.success) throw new Error(response.error);

      setFavoriteStatus(prev => ({
        ...prev,
        [agendaItem.id]: newFavorite,
      }));
      
      if (newFavorite) {
        showSuccess(t('messages.addedToFavorites'));
      } else {
        showWarning(t('messages.removedFromFavorites'));
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showError(t('messages.error'), newFavorite ? t('messages.addToFavoritesError') : t('messages.removeFromFavoritesError'));
    }
  };

  // Adding a session is an explicit opt-in and should create a confirmed
  // attendance record. The confirmation modal is still used when removing a
  // session (or when confirming from other flows), but an Add to agenda tap
  // must not leave a tentative row behind in My Schedule.
  /* istanbul ignore next -- exercised through the native/web agenda interaction flow */
  const handleAgendaAction = (agendaItem: AgendaItem, startTime: Date) => {
    if (!user) {
      showError(t('messages.error', 'Error'), t('messages.signInToManageAgenda', 'Sign in to manage your agenda'));
      return;
    }

    const currentStatus = userAgendaStatus[agendaItem.id] || 'tentative';
    if (currentStatus !== 'confirmed') {
      void handleToggleConfirmation(agendaItem, startTime, 'confirmed');
      return;
    }

    if (!isNaN(startTime.getTime())) {
      setConfirmationModal({ visible: true, agendaItem, startTime });
      return;
    }

    void handleToggleConfirmation(agendaItem, new Date(), 'tentative');
  };

  // Helper function to get the event's date based on day field or ISO time
  const getEventDate = (item: AgendaItem): Date | null => {
    // Map the item's day field to an actual calendar date, derived from
    // *this* event's real eventStartDate (day N = eventStartDate + (N-1)
    // days). Previously hardcoded to November 12-14, 2025 -- the original
    // bsl2025 hub event's dates -- which silently marked every tour-stop
    // event's agenda (chile2026, peru2026, colombia2026, ...) as already
    // past, since November 2025 predates all of them.
    const day = (item as any).day;
    if (day && event?.eventStartDate) {
      const dayMatch = String(day).match(/(\d+)/);
      const dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : null;
      if (dayNumber && dayNumber >= 1) {
        // Parse event start date preserving its local timezone (not device timezone).
        // Extract date components from ISO string before the T separator to avoid
        // timezone conversion. E.g., "2026-08-05T09:00:00-04:00" → year 2026, month 8, day 5.
        const isoMatch = event.eventStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const [, year, month, date] = isoMatch;
          const eventYear = parseInt(year, 10);
          const eventMonth = parseInt(month, 10) - 1; // JS months are 0-indexed
          const eventDay = parseInt(date, 10) + (dayNumber - 1);
          return new Date(eventYear, eventMonth, eventDay);
        }
        // Fallback: parse as Date (may be affected by device timezone)
        const start = new Date(event.eventStartDate);
        if (!isNaN(start.getTime())) {
          return new Date(start.getFullYear(), start.getMonth(), start.getDate() + (dayNumber - 1));
        }
      }
    }

    // Fallback: try to parse from ISO time format
    if (item.time) {
      try {
        const startTime = parseEventISO(item.time);
        if (!isNaN(startTime.getTime())) {
          // Return the date part (year, month, day) of the start time
          return new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
        }
      } catch {
        // Ignore parse errors
      }
    }

    return null;
  };

  // Helper function to check if an agenda item has passed
  const isEventPast = (item: AgendaItem): boolean => {
    if (!item.time) return false;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get the event's date
    const eventDate = getEventDate(item);
    if (!eventDate) {
      // If we can't determine the date, fall back to time-only comparison
      // This handles the case where day info is missing
      let endTime: Date | null = null;
      
      // Try to parse time range format "HH:MM - HH:MM"
      const timeMatch = item.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const endHour = parseInt(timeMatch[3], 10);
        const endMin = parseInt(timeMatch[4], 10);
        endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endHour, endMin);
      } else {
        // Try ISO format
        try {
          const startTime = parseEventISO(item.time);
          if (!isNaN(startTime.getTime())) {
            const duration = (item as any).duration_minutes || 60;
            endTime = new Date(startTime.getTime() + duration * 60 * 1000);
          }
        } catch {
          return false;
        }
      }
      
      if (!endTime) return false;
      return now > endTime;
    }
    
    // Compare dates first (year, month, day only)
    const eventDayOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const todayDayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // If event is on a past day, it's definitely past
    if (eventDayOnly < todayDayOnly) {
      return true;
    }
    
    // If event is on a future day, it's not past
    if (eventDayOnly > todayDayOnly) {
      return false;
    }
    
    // If event is today, check if the end time has passed
    let endTime: Date | null = null;
    
    // Try to parse time range format "HH:MM - HH:MM"
    const timeMatch = item.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const endHour = parseInt(timeMatch[3], 10);
      const endMin = parseInt(timeMatch[4], 10);
      // Use the event's date, not today
      endTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), endHour, endMin);
    } else {
      // Try ISO format
      try {
        const startTime = parseEventISO(item.time);
        if (!isNaN(startTime.getTime())) {
          const duration = (item as any).duration_minutes || 60;
          endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        }
      } catch {
        return false;
      }
    }
    
    if (!endTime) return false;
    return now > endTime;
  };

  // Render a single agenda card
  /* istanbul ignore next -- rendered by the platform agenda screen */
  const renderAgendaItem = (item: AgendaItem) => {
    const userStatus = userAgendaStatus[item.id] || 'tentative';
    const isConfirmed = userStatus === 'confirmed';
    const isFavorite = favoriteStatus[item.id] || false;
    const isPast = isEventPast(item);
    const startTime = parseEventISO((item as any).time || '');
    const typeColor = getAgendaTypeColor(item.type);
    const typeLabel = t(`types.${item.type}`, item.type).toUpperCase();
    const displayDescription = getDisplayAgendaDescription(item.description);
    const location = item.location?.trim()
      || (item.type === 'keynote'
        ? t('locations.mainStage')
        : item.type === 'registration'
          ? t('locations.registrationArea')
          : eventVenueLabel);
    const venueImage = resolveAgendaVenueImage(event?.id, eventVenueLabel, location);
    const resolvedSpeakers: {
      reference: string;
      id: string | null;
      displayName: string;
      image?: string;
    }[] = (item.speakers || []).map((speaker: string) => ({
      reference: speaker,
      ...resolveAgendaSpeaker(speaker),
    }));
    const featuredSpeaker = resolvedSpeakers.find((speaker) => speaker.image) || resolvedSpeakers[0];
    const usesSpeakerPortrait = item.type === 'keynote' && Boolean(featuredSpeaker);
    const renderAgendaAction = (
      action: 'calendar' | 'favorite' | 'schedule',
      label: string,
      icon: React.ReactNode,
      onPress: () => void,
    ) => {
      const actionId = `${item.id}:${action}`;
      const isExpanded = expandedAgendaAction === actionId;

      return (
        <Pressable
          key={action}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={t('actions.actionHint', 'Opens this session action')}
          onPress={onPress}
          onHoverIn={() => handleAgendaActionHoverIn(actionId)}
          onHoverOut={() => handleAgendaActionHoverOut(actionId)}
          onFocus={() => handleAgendaActionHoverIn(actionId)}
          onBlur={() => setExpandedAgendaAction((current) => current === actionId ? null : current)}
          style={({ pressed }) => [
            styles.agendaTool,
            isExpanded && styles.agendaToolExpanded,
            pressed && styles.agendaToolPressed,
          ]}
        >
          {icon}
          {isExpanded ? <Text pointerEvents="none" style={styles.agendaToolLabel}>{label}</Text> : null}
        </Pressable>
      );
    };
    
    return (
      <View
        key={item.id}
        testID={`agenda-card-${item.id}`}
        style={[
          isAgendaGrid && styles.agendaGridCell,
        ]}
        ref={(ref) => {
          sessionItemRefs.current[item.id] = ref;
        }}
      >
        <Surface
          mode={interfaceMode}
          style={[
            styles.agendaItem,
            isCompactAgenda && styles.agendaItemCompact,
            isAgendaGrid && styles.agendaItemGrid,
            { borderLeftColor: typeColor },
            isPast && styles.agendaItemPast,
          ]}
        >
          <View
            testID={`agenda-card-layout-${item.id}`}
            style={[
              styles.agendaItemLayout,
              isCompactAgenda && styles.agendaItemLayoutCompact,
              isAgendaGrid && styles.agendaItemLayoutGrid,
            ]}
          >
            <View
              testID={`agenda-card-media-${item.id}`}
              style={[
                styles.agendaMedia,
                isCompactAgenda && styles.agendaMediaCompact,
                isAgendaGrid && styles.agendaMediaGrid,
                { backgroundColor: `${typeColor}20` },
              ]}
            >
              {venueImage ? (
                <>
                  <Image
                    testID={`agenda-card-venue-${item.id}`}
                    source={venueImage}
                    resizeMode="cover"
                    style={styles.agendaVenueImage}
                    accessible={false}
                  />
                  <View pointerEvents="none" style={styles.agendaVenueScrim} />
                </>
              ) : null}
              {usesSpeakerPortrait && featuredSpeaker ? (
                <View style={styles.agendaMediaFallback}>
                  <SpeakerAvatar
                    name={featuredSpeaker.displayName}
                    imageUrl={featuredSpeaker.image}
                    size={isAgendaGrid ? 112 : isCompactAgenda ? 52 : 72}
                    showBorder
                    style={styles.agendaFeaturedAvatar}
                  />
                </View>
              ) : null}
              {usesSpeakerPortrait && resolvedSpeakers.length > 1 ? (
                <View style={styles.agendaMediaCount}>
                  <Text style={styles.agendaMediaCountText}>+{resolvedSpeakers.length - 1}</Text>
                </View>
              ) : null}
              <View
                testID={`agenda-card-time-footer-${item.id}`}
                style={styles.agendaMediaFooter}
              >
                <NativeSafeIcon name="schedule" size={14} color="#FFFFFF" />
                <Text
                  testID={`agenda-card-time-${item.id}`}
                  style={styles.agendaTime}
                  numberOfLines={2}
                >
                  {formatAgendaCardTime(item, eventTzOffset)}
                </Text>
              </View>
            </View>

            <View style={[styles.agendaItemContent, isCompactAgenda && styles.agendaItemContentCompact]}>
              <AgendaTypeReveal
                itemId={item.id}
                typeColor={typeColor}
                foregroundColor={isDark ? uiTokens.colors.dark.onAccent : uiTokens.colors.light.text}
                surfaceColor={colors.background.paper}
                iconName={getAgendaTypeIcon(item.type) as NativeSafeIconName}
                label={typeLabel}
                accessibilityLabel={t('types.revealLabel', `Session type: ${typeLabel}`)}
                accessibilityHint={t('types.revealHint', 'Reveals this session type')}
              />
              <View style={styles.agendaTitleRow}>
                <View style={styles.agendaTitleMeta}>
                  <Text
                    style={[styles.agendaTitle, isCompactAgenda && styles.agendaTitleCompact]}
                    numberOfLines={isCompactAgenda ? 2 : 3}
                  >
                    {cleanSessionTitle(item.title)}
                  </Text>
                  {isPast ? (
                    <Badge mode={interfaceMode} tone="neutral">
                      {t('badges.past')}
                    </Badge>
                  ) : null}
                </View>
              </View>

              <View style={styles.locationContainer}>
                <MaterialIcons
                  name="location-on"
                  size={15}
                  color={typeColor}
                  accessibilityLabel={t('labels.location')}
                />
                <Text style={styles.agendaLocation} numberOfLines={1}>{location}</Text>
              </View>

              <View style={[styles.agendaItemTools, isCompactAgenda && styles.agendaItemToolsCompact]}>
                {renderAgendaAction(
                  'calendar',
                  t('calendar.openPicker', 'Add this session to a calendar'),
                  <MaterialIcons name="event" size={18} color={colors.primary} />,
                  () => setCalendarPickerItem(item),
                )}
                {renderAgendaAction(
                  'favorite',
                  isFavorite ? t('actions.removeFromFavorites', 'Remove from favorites') : t('actions.addToFavorites', 'Add to favorites'),
                  <MaterialIcons name={isFavorite ? 'star' : 'star-border'} size={18} color={isFavorite ? colors.primary : colors.text.secondary} />,
                  () => { void handleToggleFavorite(item); },
                )}
                {renderAgendaAction(
                  'schedule',
                  isConfirmed ? t('actions.removeFromAgenda', 'Remove from agenda') : t('actions.addToAgenda', 'Add to agenda'),
                  <MaterialIcons name={isConfirmed ? 'check-circle' : 'add-circle-outline'} size={19} color={isConfirmed ? colors.success.main : colors.primary} />,
                  () => { void handleAgendaAction(item, startTime); },
                )}
              </View>

              {!isCompactAgenda && displayDescription ? (
                <Text style={styles.agendaDescription}>{displayDescription}</Text>
              ) : null}

              {resolvedSpeakers.length > 0 ? (
                <View style={styles.speakersContainer}>
                  <MaterialIcons
                    name="people"
                    size={16}
                    color={colors.text.secondary}
                    accessibilityLabel={t('labels.speakers')}
                  />
                  <View style={styles.speakersList}>
                    {resolvedSpeakers.map(({ reference, id: speakerId, displayName, image }) => {
                      const isClickable = speakerId !== null;
                      const chipContent = (
                        <>
                          {!isCompactAgenda ? (
                            <SpeakerAvatar name={displayName} imageUrl={image} size={32} showBorder />
                          ) : null}
                          <Text
                            style={[styles.agendaSpeakers, isClickable && styles.clickableSpeaker]}
                            numberOfLines={1}
                          >
                            {displayName}
                          </Text>
                        </>
                      );
                      return isClickable ? (
                        <TouchableOpacity key={reference} onPress={() => handleSpeakerPress(reference)} style={[styles.speakerChip, isCompactAgenda && styles.speakerChipCompact]}>
                          {chipContent}
                        </TouchableOpacity>
                      ) : (
                        <View key={reference} style={[styles.speakerChip, isCompactAgenda && styles.speakerChipCompact]}>{chipContent}</View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </Surface>
      </View>
    );
  };
  // Show global loader while loading. Also cover the gap between agenda
  // finishing its load and the separate grouping effect (deps: [agenda,
  // loading]) actually running: that effect only fires on the render AFTER
  // `loading` flips to false, so for one frame agenda has real items but
  // agendaByDay is still {} and activeTab still points at the unset
  // default -- which would otherwise render the real "no agenda for this
  // event" empty state for real data that just hasn't been grouped yet.
  const agendaGroupingPending = agenda.length > 0 && Object.keys(agendaByDay).length === 0;
  if (loading || agendaGroupingPending) {
    return (
      <LoadingScreen
        message={t('loading')}
        fullScreen={true}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        ref={scrollViewRef}
      >
        {/* Event Header */}
        <EventBanner
          title={t('title')}
          subtitle={`${agenda.length === 1 ? t('subtitle_one') : t('subtitle_other').replace('{count}', String(agenda.length))} • ${eventVenueLabel}`}
          date={eventDateLabel}
          showCountdown={!isEventFinished && Boolean(event?.eventStartDate)}
          showLiveIndicator={isLive && !isEventFinished && Boolean(event?.eventStartDate)}
          isEventFinished={isEventFinished}
          eventStartDate={event?.eventStartDate}
          eventId={eventId}
          eventImage={event?.image}
          eventVideo={event?.heroVideo}
        />

        {/* Day selection exposes the programme context before a session is chosen. */}
        {Object.keys(agendaByDay).length > 0 && (
          <View style={styles.tabContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabScrollContent}
            >
              {Object.keys(agendaByDay).map((dayKey) => {
                const selected = activeTab === dayKey;
                const sessionCount = agendaByDay[dayKey].length;
                return (
                  <TouchableOpacity
                    key={dayKey}
                    accessibilityRole="tab"
                    accessibilityLabel={`${getTabLabel(dayKey)} · ${sessionCount} ${t('tabs.sessions', 'sessions')}`}
                    accessibilityState={{ selected }}
                    style={styles.dayTabTouchable}
                    onPress={() => {
                    userSelectedTabRef.current = true; // Mark as user-selected
                    // Clear URL query parameters when user manually switches tabs
                    // This prevents the scrolling effect from interfering with manual tab selection
                    if (params.session || params.scrollTo) {
                      handledSessionRef.current = null; // Reset session ref
                      router.replace(`/events/${eventId}/agenda`);
                    }
                    setActiveTab(dayKey);
                  }}
                  >
                    <LinearGradient
                      colors={selected
                        ? [colors.primaryLight, colors.background.paper]
                        : [colors.background.default, colors.background.paper]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.dayTab, selected && styles.dayTabSelected]}
                    >
                      <Text style={[styles.dayTabLabel, selected && styles.dayTabLabelSelected]}>{getTabLabel(dayKey)}</Text>
                      {!!getTabTheme(dayKey) && (
                        <Text style={[styles.dayTabTheme, selected && styles.dayTabThemeSelected]} numberOfLines={2}>
                          {getTabTheme(dayKey)}
                        </Text>
                      )}
                      <View style={[styles.dayTabCount, selected && styles.dayTabCountSelected]}>
                        <Text style={[styles.dayTabCountText, selected && styles.dayTabCountTextSelected]}>
                          {sessionCount} {t('tabs.sessions', 'sessions')}
                        </Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View
              testID="agenda-type-legend"
              accessibilityLabel={t('legend.label', 'Session type legend')}
              style={styles.agendaTypeLegend}
            >
              <Text style={styles.agendaTypeLegendTitle}>
                {t('legend.title', 'Session types')}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.agendaTypeLegendItems}
                style={styles.agendaTypeLegendScroll}
              >
                {filterGroups[0].options.map((option) => (
                  <AgendaTypeLegendControl
                    key={option.key}
                    itemKey={option.key}
                    label={option.label}
                    color={option.color}
                    iconName={getAgendaTypeIcon(option.key) as NativeSafeIconName}
                    surfaceColor={colors.background.paper}
                    borderColor={colors.divider}
                    textColor={colors.text.primary}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        )}

      {/* Unified Search and Filter Section */}
      {agenda.length > 0 && (
        <UnifiedSearchAndFilter
          data={agenda}
          onFilteredData={setFilteredAgenda}
          onSearchChange={() => {}}
          searchPlaceholder={t('search.placeholder')}
          searchFields={['title', 'description', 'type', 'speakers']}
          filterGroups={filterGroups}
          customFilterLogic={customAgendaFilterLogic}
          showResultsCount={true}
        />
      )}

      {/* The full day theme is kept out of the compact day chip so translated
          copy can wrap naturally here. */}
      {activeTab && Object.keys(agendaByDay).length > 0 && (
        <View style={styles.dayHeader}>
          <View style={styles.dayHeaderCopy}>
            <Text style={styles.dayHeaderLabel}>{getTabLabel(activeTab)}</Text>
            {!!getTabTheme(activeTab) && (
              <Text style={styles.dayHeaderTheme}>{getTabTheme(activeTab)}</Text>
            )}
          </View>
          <View style={styles.dayHeaderControls}>
            <IconButton
              label={t('refreshAgenda', 'Refresh agenda')}
              mode={interfaceMode}
              accentColor={colors.primary}
              revealLabel
              disabled={loading}
              onPress={() => { void loadAgenda(); }}
              testID="agenda-refresh-control"
            >
              <NativeSafeIcon name="refresh" size={18} color={colors.primary} />
            </IconButton>
            <View accessibilityLabel={t('viewMode.label', 'Agenda display')} style={styles.agendaModeSwitcher}>
              {([
                { key: 'compact' as const, icon: 'rail' as const, label: t('viewMode.compact', 'Compact view') },
                { key: 'list' as const, icon: 'list' as const, label: t('viewMode.list', 'List view') },
                { key: 'grid' as const, icon: 'grid' as const, label: t('viewMode.grid', 'Grid view') },
              ]).map((mode) => (
                <IconButton
                  key={mode.key}
                  mode={interfaceMode}
                  label={mode.label}
                  accessibilityState={{ selected: agendaLayout === mode.key }}
                  onPress={() => setAgendaLayout(mode.key)}
                  style={[styles.agendaModeButton, agendaLayout === mode.key && styles.agendaModeButtonSelected]}
                >
                  <NativeSafeIcon name={mode.icon} size={18} color={agendaLayout === mode.key ? colors.primaryContrastText : colors.text.secondary} />
                </IconButton>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Tab Content */}
      <View style={styles.contentContainer}>
        {activeTab && agendaByDay[activeTab] ? (
          <View
            testID={isAgendaGrid ? 'agenda-grid' : 'agenda-list'}
            style={[styles.agendaList, isAgendaGrid && styles.agendaGridList]}
          >
            {(() => {
              // Filter the already time-sorted day sequence so both views remain chronological.
              const filteredIds = new Set(filteredAgenda.map((item) => String(item.id)));
              const filteredItems = (agendaByDay[activeTab] || []).filter((item) => filteredIds.has(String(item.id)));

              if (filteredItems.length === 0) {
                return (
                  <View style={styles.noResultsContainer}>
                    <MaterialIcons name="search-off" size={48} color={colors.text.secondary} />
                    <Text style={styles.noResultsText}>{t('noResults.title')}</Text>
                    <Text style={styles.noResultsSubtext}>{t('noResults.subtitle')}</Text>
                  </View>
                );
              }

              return filteredItems.map(renderAgendaItem);
            })()}
          </View>
        ) : agenda.length > 0 ? (
          // We already have real agenda items (confirmed by the top-level
          // loading gate above), but activeTab doesn't have a matching
          // agendaByDay entry yet -- e.g. the session/deep-link effect set
          // activeTab to a key the grouping effect hasn't produced yet.
          // This is still a loading state, not "no agenda for this event":
          // agenda.length > 0 already proves there IS agenda.
          <View style={styles.agendaList}>
            <LoadingScreen message={t('loading')} fullScreen={false} />
          </View>
        ) : (
          // Only reachable once agenda is confirmed empty -- the real "no
          // agenda for this event" case, not a stand-in for still loading.
          <View style={styles.noAgendaContainer}>
            <MaterialIcons name="event-busy" size={48} color={colors.text.secondary} />
            <Text style={styles.noAgendaText}>{t('empty.title')}</Text>
            <Text style={styles.noAgendaSubtext}>{t('empty.subtitle')}</Text>
            <View style={styles.noLiveIndicator}>
              <MaterialIcons name="schedule" size={16} color={colors.text.secondary} />
              <Text style={styles.noLiveText}>{t('empty.noLiveData')}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={t('empty.retry')}
              accessibilityRole="button"
              style={styles.retryAgendaButton}
              onPress={() => {
                void loadAgenda();
              }}
            >
              <MaterialIcons name="refresh" size={18} color={colors.primary} />
              <Text style={styles.retryAgendaButtonText}>{t('empty.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Confirmation Modal */}
      {confirmationModal.agendaItem && confirmationModal.startTime && (
        <ScheduleConfirmationModal
          visible={confirmationModal.visible}
          title={confirmationModal.agendaItem.title || t('messages.untitledEvent')}
          location={confirmationModal.agendaItem.location || 
            (confirmationModal.agendaItem.type === 'keynote' ? t('locations.mainStage') : 
             confirmationModal.agendaItem.type === 'registration' ? t('locations.registrationArea') : undefined)}
          startTime={confirmationModal.startTime}
          eventTzOffset={eventTzOffset}
          isConfirmed={(userAgendaStatus[confirmationModal.agendaItem.id] || 'tentative') === 'confirmed'}
          onConfirm={() => handleToggleConfirmation(confirmationModal.agendaItem!, confirmationModal.startTime!)}
          onCancel={() => setConfirmationModal({ visible: false, agendaItem: null, startTime: null })}
          isLoading={isConfirming}
          isFreeSlot={false}
          freeSlotStatus="available"
          isAgendaEvent={true}
          isFavorite={favoriteStatus[confirmationModal.agendaItem.id] || false}
          onToggleFavorite={() => confirmationModal.agendaItem && handleToggleFavorite(confirmationModal.agendaItem)}
          onViewAgenda={() => {
            const slotStartTime = confirmationModal.startTime;
            setConfirmationModal({ visible: false, agendaItem: null, startTime: null });
            router.push(
              (slotStartTime
                ? `/events/${eventId}/networking/my-schedule?scrollTo=${encodeURIComponent(slotStartTime.toISOString())}`
                : `/events/${eventId}/networking/my-schedule`) as any
            );
          }}
        />
      )}
      <AgendaActionResultModal
        visible={agendaActionResult.visible}
        added={agendaActionResult.added}
        onClose={() => setAgendaActionResult((prev) => ({ ...prev, visible: false }))}
        onViewAgenda={() => {
          const slotStartTime = agendaActionResult.slotStartTime;
          setAgendaActionResult((prev) => ({ ...prev, visible: false }));
          router.push(
            (slotStartTime
              ? `/events/${eventId}/networking/my-schedule?scrollTo=${encodeURIComponent(slotStartTime.toISOString())}`
              : `/events/${eventId}/networking/my-schedule`) as any
          );
        }}
      />
      <Modal
        visible={Boolean(calendarPickerItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarPickerItem(null)}
      >
        <View style={styles.calendarModalOverlay}>
          <Pressable style={styles.calendarModalBackdrop} onPress={() => setCalendarPickerItem(null)} />
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarModalHeading}>
              <View>
                <Text style={styles.calendarModalEyebrow}>{t('calendar.eyebrow', 'SESSION REMINDER')}</Text>
                <Text style={styles.calendarModalTitle}>{t('calendar.title', 'Add to calendar')}</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('calendar.close', 'Close calendar options')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => setCalendarPickerItem(null)}
                style={styles.calendarModalClose}
              >
                <MaterialIcons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.calendarModalSession} numberOfLines={2}>
              {calendarPickerItem?.title || t('messages.untitledEvent')}
            </Text>
            <Text style={styles.calendarModalHint}>
              {t('calendar.chooseHint', 'Choose where you want to save this session.')}
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('calendar.google', 'Add to Google Calendar')}
              onPress={() => void handleCalendarPickerAction('google')}
              style={[styles.calendarChoice, styles.calendarChoicePrimary]}
            >
              <MaterialIcons name="event" size={20} color="#FFFFFF" />
              <View style={styles.calendarChoiceCopy}>
                <Text style={styles.calendarChoiceTitlePrimary}>{t('calendar.google', 'Google Calendar')}</Text>
                <Text style={styles.calendarChoiceDetailPrimary}>{t('calendar.googleDetail', 'Open a ready-to-save event')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('calendar.apple', 'Apple Calendar (iCalendar)')}
              onPress={() => void handleCalendarPickerAction('ics')}
              style={styles.calendarChoice}
            >
              <MaterialIcons name="event" size={20} color={colors.primary} />
              <View style={styles.calendarChoiceCopy}>
                <Text style={styles.calendarChoiceTitle}>{t('calendar.apple', 'Apple Calendar')}</Text>
                <Text style={styles.calendarChoiceDetail}>{t('calendar.appleDetail', 'Use the iCalendar file')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('calendar.download', 'Download .ics file')}
              onPress={() => void handleCalendarPickerAction('ics')}
              style={styles.calendarChoice}
            >
              <MaterialIcons name="download" size={20} color={colors.text.secondary} />
              <View style={styles.calendarChoiceCopy}>
                <Text style={styles.calendarChoiceTitle}>{t('calendar.download', 'Download .ics')}</Text>
                <Text style={styles.calendarChoiceDetail}>{t('calendar.downloadDetail', 'For Outlook and other calendar apps')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
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
    backgroundColor: colors.background.default,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  // Programme-day cards keep the date, theme, and session count readable.
  tabContainer: {
    backgroundColor: colors.background.default,
    paddingTop: uiTokens.space.lg,
    paddingBottom: uiTokens.space.sm,
    width: '100%',
  },
  tabScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: uiTokens.space.sm,
    paddingHorizontal: uiTokens.space.lg,
  },
  agendaTypeLegend: {
    alignItems: 'center',
    paddingHorizontal: uiTokens.space.md,
    paddingTop: uiTokens.space.md,
  },
  agendaTypeLegendTitle: {
    color: colors.text.secondary,
    fontSize: uiTokens.type.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: uiTokens.space.xs,
    textTransform: 'uppercase',
  },
  agendaTypeLegendItems: {
    flexDirection: 'row',
    flexGrow: 1,
    gap: uiTokens.space.xs,
    justifyContent: 'center',
    paddingHorizontal: uiTokens.space.xs,
  },
  agendaTypeLegendScroll: {
    width: '100%',
  },
  dayTab: {
    width: 148,
    minHeight: 104,
    borderWidth: 1,
    borderRadius: uiTokens.radius.card,
    borderColor: colors.divider,
    overflow: 'hidden',
    padding: uiTokens.space.md,
    justifyContent: 'space-between',
    gap: uiTokens.space.xs,
  },
  dayTabTouchable: {
    borderRadius: uiTokens.radius.card,
  },
  dayTabSelected: {
    borderColor: colors.primary,
  },
  dayTabLabel: {
    color: colors.text.primary,
    fontSize: uiTokens.type.label,
    fontWeight: '800',
  },
  dayTabLabelSelected: {
    color: colors.primary,
  },
  dayTabTheme: {
    color: colors.text.secondary,
    fontSize: uiTokens.type.caption,
    lineHeight: 16,
  },
  dayTabThemeSelected: {
    color: colors.text.primary,
  },
  dayTabCount: {
    alignSelf: 'flex-start',
    borderRadius: uiTokens.radius.pill,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(7,17,30,0.06)',
    paddingHorizontal: uiTokens.space.sm,
    paddingVertical: 3,
  },
  dayTabCountSelected: {
    backgroundColor: `${colors.primary}14`,
    borderColor: `${colors.primary}40`,
    borderWidth: uiTokens.control.borderWidth,
  },
  dayTabCountText: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  dayTabCountTextSelected: {
    color: colors.primary,
  },
  dayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: uiTokens.space.md,
    paddingHorizontal: uiTokens.space.xl,
    paddingTop: uiTokens.space.lg,
    paddingBottom: uiTokens.space.sm,
  },
  dayHeaderCopy: {
    flex: 1,
    gap: uiTokens.space.xs,
  },
  dayHeaderControls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: uiTokens.space.sm,
  },
  agendaModeSwitcher: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: uiTokens.radius.input,
    backgroundColor: colors.background.paper,
  },
  agendaModeButton: {
    width: 34,
    height: 34,
  },
  agendaModeButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayHeaderLabel: {
    fontSize: uiTokens.type.title,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.25,
  },
  dayHeaderTheme: {
    fontSize: uiTokens.type.label,
    fontWeight: '400',
    color: colors.text.secondary,
    lineHeight: 20,
  },
  agendaList: {
    paddingHorizontal: uiTokens.space.xl,
    paddingTop: uiTokens.space.sm,
  },
  agendaGridList: {
    gap: uiTokens.space.md,
  },
  agendaGridCell: {
    width: '100%',
  },
  agendaItem: {
    backgroundColor: colors.background.paper,
    borderLeftWidth: 4,
    marginBottom: uiTokens.space.md,
    overflow: 'hidden',
    padding: 0,
    boxShadow: uiTokens.effects.cardShadow,
  },
  agendaItemCompact: {
    marginBottom: uiTokens.space.sm,
  },
  agendaItemGrid: {
    height: '100%',
    marginBottom: 0,
  },
  agendaItemLayout: {
    flexDirection: 'row',
  },
  agendaMedia: {
    alignSelf: 'stretch',
    backgroundColor: colors.background.default,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 184,
    overflow: 'hidden',
    position: 'relative',
    width: 168,
  },
  agendaMediaCompact: {
    minHeight: 118,
    width: 116,
  },
  agendaMediaGrid: {
    minHeight: 260,
    width: '100%',
  },
  agendaMediaFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 38,
  },
  agendaVenueImage: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
  agendaVenueScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: uiTokens.effects.mediaVenueScrim,
  },
  agendaFeaturedAvatar: {
    borderColor: colors.background.paper,
    borderWidth: 4,
    boxShadow: uiTokens.effects.cardShadow,
  },
  agendaMediaCount: {
    alignItems: 'center',
    backgroundColor: uiTokens.effects.mediaOverlayStrong,
    borderColor: uiTokens.effects.mediaBorder,
    borderRadius: uiTokens.radius.circle,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: uiTokens.space.sm,
    top: uiTokens.space.sm,
    width: 30,
  },
  agendaMediaCountText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  agendaMediaFooter: {
    alignItems: 'center',
    backgroundColor: uiTokens.effects.mediaOverlayGlass,
    borderTopColor: uiTokens.effects.mediaBorder,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: uiTokens.space.xs,
    left: 0,
    minHeight: 40,
    paddingHorizontal: uiTokens.space.sm,
    paddingVertical: uiTokens.space.xs,
    position: 'absolute',
    right: 0,
    boxShadow: '0 -8px 24px rgba(3, 12, 24, 0.16)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: `blur(${uiTokens.effects.mediaOverlayBlur}px) saturate(1.25)`,
          WebkitBackdropFilter: `blur(${uiTokens.effects.mediaOverlayBlur}px) saturate(1.25)`,
        } as any)
      : {}),
  },
  agendaItemLayoutCompact: {
    minHeight: 118,
  },
  agendaItemLayoutGrid: {
    flexDirection: 'column',
  },
  agendaTime: {
    fontSize: uiTokens.type.caption,
    fontWeight: '800',
    color: '#FFFFFF',
    flexShrink: 1,
    lineHeight: 15,
    textShadowColor: 'rgba(3, 12, 24, 0.62)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  agendaItemPast: {
    opacity: 0.62,
  },
  agendaItemContent: {
    flex: 1,
    overflow: 'hidden',
    padding: uiTokens.space.xl,
    paddingBottom: uiTokens.space.xl + AGENDA_TYPE_REVEAL_COLLAPSED_WIDTH + uiTokens.space.sm,
    position: 'relative',
  },
  agendaItemContentCompact: {
    paddingHorizontal: uiTokens.space.md,
    paddingVertical: uiTokens.space.sm,
    paddingBottom: AGENDA_TYPE_REVEAL_COLLAPSED_WIDTH + uiTokens.space.md,
  },
  agendaTitleRow: {
    marginBottom: uiTokens.space.sm,
  },
  agendaTitleMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: uiTokens.space.xs,
    width: '100%',
  },
  agendaTitle: {
    fontSize: uiTokens.type.body,
    fontWeight: '700',
    color: colors.text.primary,
    flexShrink: 1,
    lineHeight: 22,
  },
  agendaTitleCompact: {
    fontSize: uiTokens.type.label,
    lineHeight: 18,
  },
  agendaItemTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiTokens.space.xs,
    flexWrap: 'wrap',
    marginBottom: uiTokens.space.md,
  },
  agendaItemToolsCompact: {
    marginBottom: uiTokens.space.sm,
  },
  agendaTool: {
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    borderColor: colors.divider,
    borderRadius: uiTokens.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: uiTokens.space.xs,
    height: uiTokens.control.compactHeight,
    justifyContent: 'center',
    minWidth: uiTokens.control.compactHeight,
    paddingHorizontal: 9,
  },
  agendaToolExpanded: {
    borderColor: colors.primary,
  },
  agendaToolPressed: {
    opacity: 0.72,
  },
  agendaToolLabel: {
    color: colors.text.primary,
    fontSize: uiTokens.type.caption,
    fontWeight: '700',
    maxWidth: 132,
  },
  calendarModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  calendarModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 12, 24, 0.56)',
  },
  calendarModalCard: {
    backgroundColor: colors.background.paper,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(7,17,30,0.08)',
  },
  calendarModalHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  calendarModalEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  calendarModalTitle: {
    color: colors.text.primary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  calendarModalClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(7,17,30,0.05)',
  },
  calendarModalSession: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
    marginTop: 18,
  },
  calendarModalHint: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 18,
  },
  calendarChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 64,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 14,
    marginTop: 9,
    backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(7,17,30,0.025)',
  },
  calendarChoicePrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    marginTop: 0,
  },
  calendarChoiceCopy: {
    flex: 1,
  },
  calendarChoiceTitle: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  calendarChoiceTitlePrimary: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  calendarChoiceDetail: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  calendarChoiceDetailPrimary: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    marginTop: 2,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  agendaDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  speakersContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  speakersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 8,
    marginTop: -2,
  },
  speakerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(7,17,30,0.04)',
    borderColor: colors.divider,
    borderRadius: uiTokens.radius.pill,
    borderWidth: 1,
    gap: 8,
    maxWidth: 240,
    minHeight: 44,
    paddingHorizontal: 5,
    paddingRight: uiTokens.space.sm,
  },
  speakerChipCompact: {
    minHeight: 30,
    paddingHorizontal: uiTokens.space.sm,
  },
  agendaSpeakers: {
    fontSize: 13,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  clickableSpeaker: {
    color: '#007AFF',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiTokens.space.xs,
    marginBottom: uiTokens.space.sm,
  },
  agendaLocation: {
    fontSize: uiTokens.type.caption,
    color: colors.text.secondary,
    flexShrink: 1,
    fontWeight: '600',
  },
  noAgendaContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noAgendaText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  noAgendaSubtext: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
  },
  noLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  noLiveText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginLeft: 4,
    fontWeight: '500',
  },
  retryAgendaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background.paper,
  },
  retryAgendaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  statusIndicatorContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  liveBadge: {
    backgroundColor: colors.success,
  },
  notLiveBadge: {
    backgroundColor: '#8E8E93',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  serviceWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: isDark ? 'rgba(255, 193, 7, 0.1)' : 'rgba(255, 193, 7, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: colors.warning.main,
  },
  serviceWarningText: {
    fontSize: 12,
    color: colors.warning.main,
    marginLeft: 6,
    fontWeight: '500',
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  notLiveDetailsDropdown: {
    position: 'absolute',
    top: 50,
    right: 0,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    minWidth: 280,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    zIndex: 1000,
  },
  notLiveDetailsContent: {
    padding: 16,
  },
  notLiveDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  notLiveIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notLiveDetailsText: {
    fontSize: 13,
    color: colors.text.primary,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
});
