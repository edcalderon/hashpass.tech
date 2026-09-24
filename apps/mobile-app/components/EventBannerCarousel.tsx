import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TouchableOpacity,
  Image,
  Text,
  TextInput,
  AccessibilityInfo,
  Platform,
  type ImageSourcePropType,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../i18n/i18n";
import { useIsMobile } from "@/hooks/useIsMobile";
import EventBanner from "./EventBanner";
import LampBrandBanner from "./LampBrandBanner";
import { getAvailableEvents, isGlobalEventTenant } from "../lib/event-detector";
import type { EventInfo } from "../lib/event-detector";
import { getLampBrandConfig } from "../lib/event-branding";
import {
  getEventBannerSlides,
  localizeEventBannerSlide,
  shouldShowEventBannerCountdown,
  type ResolvedEventBannerSlide,
} from "../lib/event-banners";
import SafeLinearGradient from "./SafeLinearGradient";
import CarouselTickPill from "./CarouselTickPill";
import { shouldStackCarouselFooter } from "../lib/carousel-layout";
import { uiTokens } from "@hashpass/ui/tokens";
import { ActionButton, FormField, IconButton } from "@hashpass/ui/primitives";
import {
  ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight,
  Compass as LucideCompass,
  Search as LucideSearch,
} from "lucide";
import { useAnimationLevel } from "../contexts/AnimationLevelContext";
import { MorphIcon } from "../lib/morph-icon";

// Wide-web peeking-card carousel constants. Native uses the paging layout
// below so a phone never has to fit a desktop-width card.
const BASE_CARD_WIDTH = 480;
const CARD_GAP = 16;
const CARD_BORDER_RADIUS = 20;

/** Compute card dimensions for the current viewport. */
function resolveCardDimensions(screenWidth: number) {
  // On wide screens, grow the card up to 60% of viewport (capped at 900px)
  // so the active card fills the center of the viewport. Cap the side
  // padding at 160px max — beyond that the empty space looks like a bug.
  const maxPadding = 160;
  const rawCardWidth = Math.min(screenWidth * 0.6, 900);
  const padding = Math.min((screenWidth - rawCardWidth) / 2, maxPadding);
  const cardWidth = Math.max(BASE_CARD_WIDTH, rawCardWidth);
  const contentPaddingX = Math.max(padding, (screenWidth - cardWidth) / 2);
  return { cardWidth, contentPaddingX, snapInterval: cardWidth + CARD_GAP };
}

/** Keep native phone slides scannable without consuming half the viewport. */
export function resolveCarouselCardHeight(isMobile: boolean, screenWidth: number) {
  if (!isMobile) return 540;
  const availableWidth = Math.max(0, screenWidth - 32);
  return Math.min(480, Math.max(420, Math.round(availableWidth * 1.18)));
}

/** Infinite-loop wrapper: clones first and last slides for seamless wrapping. */
function withInfiniteClones(slides: CarouselSlide[]): CarouselSlide[] {
  if (slides.length <= 1) return slides;
  return [slides[slides.length - 1], ...slides, slides[0]];
}

/** Static base styles for animated cards (width overridden inline per viewport). */
const stylesBase = StyleSheet.create({
  slide: {
    marginRight: CARD_GAP,
  },
});

/** Animated wrapper for each carousel card — scale/opacity based on scroll distance. */
function AnimatedCard({
  children,
  activeIndex,
  index,
  cardWidth,
}: {
  children: React.ReactNode;
  activeIndex: { value: number };
  index: number;
  cardWidth: number;
}) {
  const animStyle = useAnimatedStyle(() => {
    const dist = Math.abs(index - activeIndex.value);
    const isActive = dist < 0.5;
    const scale = isActive ? 1 : Math.max(0.9, 1 - (dist - 0.5) * 0.1);
    const opacity = isActive ? 1 : Math.max(0.6, 1 - (dist - 0.5) * 0.4);
    return {
      width: cardWidth,
      transform: [{ scale }],
      opacity,
    };
  }, [cardWidth]);

  return <Animated.View style={[stylesBase.slide, animStyle]}>{children}</Animated.View>;
}

interface CarouselSlide {
  type: "download" | "event" | "logo" | "campaign" | "proposal";
  event?: EventInfo;
  banner?: ResolvedEventBannerSlide;
  useEventBranding?: boolean;
  logoId?: string;
  logoSrc?: ImageSourcePropType;
  logoSrcDark?: ImageSourcePropType;
  logoSrcLight?: ImageSourcePropType;
  backgroundColor?: string;
  accentColor?: string;
  campaignId?: string;
  campaignSrc?: ImageSourcePropType;
  campaignFit?: "cover" | "contain";
  campaignLogoSrc?: ImageSourcePropType;
  campaignCompactBranding?: boolean;
  campaignCity?: string;
  campaignFederationLogoSrc?: ImageSourcePropType;
  campaignMinDeporteLogoSrc?: ImageSourcePropType;
  campaignInderLogoSrc?: ImageSourcePropType;
  campaignLocation?: string;
  campaignDate?: string;
  campaignAccessibilityLabel?: string;
}

interface CampaignSlideAsset {
  id: string;
  image: ImageSourcePropType;
  fit?: "cover" | "contain";
  logo?: ImageSourcePropType;
  compactBranding?: boolean;
  city?: string;
  federationLogo?: ImageSourcePropType;
  minDeporteLogo?: ImageSourcePropType;
  inderLogo?: ImageSourcePropType;
  location?: string;
  date?: string;
  accessibilityLabel: string;
}

interface EventBannerCarouselProps {
  showDotIndicators?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  /** Whether campaign CTA buttons are rendered on event slides. */
  showCtas?: boolean;
  onEventPress?: (event: EventInfo) => void;
  /** Optional landing-level action displayed at the start of the slider controls. */
  footerLeadingAction?: React.ReactNode;
  /** Optional landing-level action displayed with the slider controls. */
  footerAction?: React.ReactNode;
  /** Enables the glass search field inside the wide-web carousel card. */
  showEventSearch?: boolean;
  /** Opens the full public event explorer from the carousel search field. */
  onExploreEvents?: () => void;
  /** Shared animated icon supplied by the landing for the explorer action. */
  explorerActionIcon?: React.ReactNode;
  onExplorerActionHoverChange?: (hovered: boolean) => void;
  /** Adds the final organizer call-to-action card to the global carousel. */
  showProposalCard?: boolean;
  onProposeEvent?: () => void;
  /** Shared animated icon supplied by the landing for the proposal action. */
  proposalActionIcon?: React.ReactNode;
  onProposalActionHoverChange?: (hovered: boolean) => void;
  /** Restricts the carousel to one selected event and its own campaign slides. */
  event?: EventInfo | null;
  lampBrandingOverrides?: Record<string, LampBrandingConfig>;
}

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase();

/**
 * Keep all discovery cards visible while moving the best textual matches to
 * the front. Searching should refine the slider, not make it feel empty.
 */
export function rankEventsForCarousel(events: EventInfo[], query: string): EventInfo[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return events;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return events
    .map((event, index) => {
      const title = normalizeSearchText(event.title || "");
      const shortName = normalizeSearchText(event.shortName || "");
      const rawAliases: unknown[] = Array.isArray(event.aliases) ? event.aliases : [];
      const aliases = rawAliases
        .filter((alias: unknown): alias is string => typeof alias === "string")
        .map(normalizeSearchText);
      const metadata = normalizeSearchText([
        event.id,
        event.subtitle,
        event.series,
        event.geo?.city,
        event.geo?.country,
        event.geo?.venue,
      ].filter(Boolean).join(" "));
      const haystack = [title, shortName, ...aliases, metadata].join(" ");
      const score = terms.reduce((total, term) => {
        if (title === normalizedQuery || shortName === normalizedQuery || aliases.includes(normalizedQuery)) {
          return total + 100;
        }
        if (title.startsWith(term) || shortName.startsWith(term) || aliases.some((alias) => alias.startsWith(term))) {
          return total + 24;
        }
        return haystack.includes(term) ? total + 8 : total;
      }, 0);
      return { event, index, score };
    })
    .sort((first, second) => second.score - first.score || first.index - second.index)
    .map(({ event }) => event);
}

export interface LampBrandingConfig {
  logoSrcDark?: string;
  logoSrcLight?: string;
  logoFallbackSrc?: string;
  logoAlt: string;
}

// webp, not svg: React Native's Image view has no SVG decoder on native
// (Android/iOS), so these must be rasterized to render at all there. Web
// renders webp fine too, so no platform branching is needed here.
const HASHPASS_DARK_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp");
const HASHPASS_LIGHT_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-black.webp");
const HASH_POKER_ROOM_LOGO = require("../assets/logos/hash-poker/hash-poker-room-logo.webp");
const HASH_POKER_ROOM_BANNER = require("../assets/images/hash-poker-room-carousel-banner.png");
const COLOMBIAN_POKER_FEDERATION_LOGO = require("../assets/logos/colombian-poker-federation/fcp-logo.png");
const MIN_DEPORTE_LOGO = require("../assets/logos/colombian-poker-federation/min-deporte-logo.png");
const INDER_MEDELLIN_LOGO = require("../assets/logos/inder/inder-medellin-logo.png");
const BSL_COLOMBIA_LOGO = require("../assets/logos/bsl/bsl-colombia-pro.webp");
const CBWEEK_CAROUSEL_BANNER = require("../assets/images/cbweek2026-carousel-banner.png");
const BSL_COLOMBIA_BOGOTA_BANNER = require("../assets/images/bsl-colombia-2026-carousel-banner.png");

const LOGO_SLIDE_BACKGROUND = "#07111F";
const LOGO_SLIDE_BACKGROUND_LIGHT = "#FFFFFF";

// Global-carousel ordering contract: HASHPASS is always the primary entry
// slide. Keep it first; it is the landing identity anchor, not an event that
// may be reordered by dates or campaign availability.
const PRIMARY_ENTRY_SLIDE = {
  id: "hashpass-main",
  darkSrc: HASHPASS_DARK_LOGO,
  lightSrc: HASHPASS_LIGHT_LOGO,
  backgroundColorDark: LOGO_SLIDE_BACKGROUND,
  backgroundColorLight: LOGO_SLIDE_BACKGROUND_LIGHT,
  accentColorDark: "#6FDDFD",
  accentColorLight: "#8B1538",
};

// These confirmed upcoming events are intentionally promoted in calendar
// order immediately after the mandatory HASHPASS primary entry. Remaining
// events retain the registry's chronological order.
const UPCOMING_EVENT_PRIORITY = ["hash-poker", "colombia2026", "cbweek2026"];

const EVENT_CAMPAIGN_SLIDES: Record<string, CampaignSlideAsset> = {
  "hash-poker": {
    id: "hash-poker-room-campaign",
    image: HASH_POKER_ROOM_BANNER,
    logo: HASH_POKER_ROOM_LOGO,
    compactBranding: true,
    location: "Hash House Club",
    city: "Medellín",
    federationLogo: COLOMBIAN_POKER_FEDERATION_LOGO,
    minDeporteLogo: MIN_DEPORTE_LOGO,
    inderLogo: INDER_MEDELLIN_LOGO,
    accessibilityLabel: "Explore Hash Poker Room at Hash House Club",
  },
  colombia2026: {
    id: "bsl-colombia-2026-campaign",
    image: BSL_COLOMBIA_BOGOTA_BANNER,
    logo: BSL_COLOMBIA_LOGO,
    location: "Bogotá, Colombia",
    date: "5–6 noviembre 2026",
    accessibilityLabel: "Explore Blockchain Summit Latam Colombia 2026 in Bogotá",
  },
  cbweek2026: {
    id: "cbweek2026-campaign",
    image: CBWEEK_CAROUSEL_BANNER,
    accessibilityLabel: "Explore Colombia Blockchain Week 2026 in Medellín",
  },
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "").trim();
  if (normalized.length === 3) {
    const r = normalized[0];
    const g = normalized[1];
    const b = normalized[2];
    return `rgba(${parseInt(r + r, 16)}, ${parseInt(g + g, 16)}, ${parseInt(b + b, 16)}, ${alpha})`;
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
};

export default function EventBannerCarousel({
  showDotIndicators = true,
  autoPlay = true,
  autoPlayInterval = 5000,
  showCtas = true,
  onEventPress,
  footerLeadingAction,
  footerAction,
  showEventSearch = false,
  onExploreEvents,
  explorerActionIcon,
  onExplorerActionHoverChange,
  showProposalCard = false,
  onProposeEvent,
  proposalActionIcon,
  onProposalActionHoverChange,
  event: selectedEvent,
  lampBrandingOverrides,
}: EventBannerCarouselProps) {
  const { isDark, colors } = useTheme();
  const { t: translate } = useTranslation("index");
  const { animationLevel } = useAnimationLevel();
  const isMobile = useIsMobile();
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isExplorerExpanded, setIsExplorerExpanded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  // Drag state for web mouse-grab on the carousel
  const dragRef = useRef<{ startX: number; scrollStart: number } | null>(null);
  const isDraggingRef = useRef(false);
  const wheelResumeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Responsive card sizing: on wide screens, grow the card and cap the
  // padding so the carousel stays centered with peeking neighbors.
  const dims = resolveCardDimensions(screenWidth);
  const { cardWidth, contentPaddingX, snapInterval } = dims;
  const hasSearchQuery = Boolean(normalizeSearchText(searchQuery));
  const shouldExpandSearch = isSearchExpanded || hasSearchQuery;
  const compactSearchWidth = uiTokens.control.minHeight;
  const expandedSearchWidth = Math.min(270, Math.max(168, cardWidth * 0.32));
  const compactExplorerWidth = uiTokens.control.minHeight;
  const expandedExplorerWidth = Math.min(188, Math.max(148, cardWidth * 0.24));
  const searchExpandProgress = useSharedValue(0);
  const explorerExpandProgress = useSharedValue(0);

  useEffect(() => {
    const nextProgress = shouldExpandSearch ? 1 : 0;
    searchExpandProgress.value = reduceMotion
      ? nextProgress
      : withTiming(nextProgress, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, searchExpandProgress, shouldExpandSearch]);

  const searchShellAnimatedStyle = useAnimatedStyle(
    () => ({
      width: interpolate(searchExpandProgress.value, [0, 1], [compactSearchWidth, expandedSearchWidth]),
    }),
    [compactSearchWidth, expandedSearchWidth],
  );
  const searchInputAnimatedStyle = useAnimatedStyle(() => ({
    opacity: searchExpandProgress.value,
    transform: [{ translateX: interpolate(searchExpandProgress.value, [0, 1], [-8, 0]) }],
  }));

  useEffect(() => {
    explorerExpandProgress.value = reduceMotion
      ? (isExplorerExpanded ? 1 : 0)
      : withTiming(isExplorerExpanded ? 1 : 0, {
          duration: 220,
          easing: Easing.out(Easing.cubic),
        });
  }, [explorerExpandProgress, isExplorerExpanded, reduceMotion]);

  const explorerShellAnimatedStyle = useAnimatedStyle(
    () => ({
      width: interpolate(
        explorerExpandProgress.value,
        [0, 1],
        [compactExplorerWidth, expandedExplorerWidth],
      ),
    }),
    [compactExplorerWidth, expandedExplorerWidth],
  );
  const explorerActionContentAnimatedStyle = useAnimatedStyle(() => ({
    // Do not reveal the expanded action until the outer glass shell has room
    // for it. Otherwise React Native Web briefly clips a second, pale pill
    // inside the circular explorer affordance while the width is animating.
    opacity: explorerExpandProgress.value < 0.98 ? 0 : 1,
  }));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (active && value) setReduceMotion(true); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // Build real slides (logical, non-cloned)
  const availableEvents: EventInfo[] = selectedEvent
    ? [selectedEvent]
    : getAvailableEvents();
  const defaultLampBrandingByEvent = useMemo<Record<string, LampBrandingConfig>>(
    () => ({
      bsl: getLampBrandConfig("bsl") || { logoAlt: "BSL On Tour" },
      peru2026: getLampBrandConfig("peru2026") || { logoAlt: "BSL Perú 2026" },
      chile2026: getLampBrandConfig("chile2026") || { logoAlt: "BSL Chile 2026" },
      colombia2026: getLampBrandConfig("colombia2026") || { logoAlt: "BSL Colombia 2026" },
      bsl2025: getLampBrandConfig("bsl2025") || { logoAlt: "BSL 2025 Archive" },
    }),
    [],
  );
  const lampBrandingByEvent = useMemo<Record<string, LampBrandingConfig>>(
    () => ({ ...defaultLampBrandingByEvent, ...(lampBrandingOverrides || {}) }),
    [defaultLampBrandingByEvent, lampBrandingOverrides],
  );

  const isGlobalTenant = isGlobalEventTenant() && !selectedEvent;
  const PAST_OR_REDUNDANT_EVENT_IDS = new Set(["bsl", "peru2026", "chile2026", "bsl2025"]);
  const carouselEvents = selectedEvent
    ? availableEvents
    : availableEvents.filter((event) => !PAST_OR_REDUNDANT_EVENT_IDS.has(event.id));
  const orderedCarouselEvents = selectedEvent
    ? carouselEvents
    : [
        ...carouselEvents.filter((event) => UPCOMING_EVENT_PRIORITY.includes(event.id)),
        ...carouselEvents.filter((event) => !UPCOMING_EVENT_PRIORITY.includes(event.id)),
      ].sort((first, second) => {
        const firstPriority = UPCOMING_EVENT_PRIORITY.indexOf(first.id);
        const secondPriority = UPCOMING_EVENT_PRIORITY.indexOf(second.id);
        if (firstPriority !== -1 || secondPriority !== -1) {
          if (firstPriority === -1) return 1;
          if (secondPriority === -1) return -1;
          return firstPriority - secondPriority;
        }
        return 0;
      });

  const rankedCarouselEvents = useMemo(
    () => rankEventsForCarousel(orderedCarouselEvents, searchQuery),
    [orderedCarouselEvents, searchQuery],
  );

  // The event registry is already sorted by start date. Keep every event's
  // poster immediately before its detail/countdown slide, so the carousel
  // never separates a campaign image from the information it introduces.
  const eventSlides = rankedCarouselEvents.flatMap((event) => {
    const campaign = isGlobalTenant
      ? EVENT_CAMPAIGN_SLIDES[event.id as keyof typeof EVENT_CAMPAIGN_SLIDES]
      : undefined;
    const informationSlides = getEventBannerSlides(event).map((banner: ResolvedEventBannerSlide) => ({
      type: "event" as const, event, banner,
      useEventBranding: !selectedEvent && !event.bannerSlides?.length,
    }));
    return campaign
      ? [{
          type: "campaign" as const,
          campaignId: campaign.id,
          campaignSrc: campaign.image,
          campaignFit: campaign.fit,
          campaignLogoSrc: campaign.logo,
          campaignCompactBranding: campaign.compactBranding,
          campaignLocation: campaign.location,
          campaignCity: campaign.city,
          campaignFederationLogoSrc: campaign.federationLogo,
          campaignMinDeporteLogoSrc: campaign.minDeporteLogo,
          campaignInderLogoSrc: campaign.inderLogo,
          campaignDate: campaign.date,
          campaignAccessibilityLabel: campaign.accessibilityLabel,
          event,
        }, ...informationSlides]
      : informationSlides;
  });

  const identitySlide: CarouselSlide[] = isGlobalTenant
    ? [{
        type: "logo" as const,
        logoId: PRIMARY_ENTRY_SLIDE.id,
        logoSrcDark: PRIMARY_ENTRY_SLIDE.darkSrc,
        logoSrcLight: PRIMARY_ENTRY_SLIDE.lightSrc,
        backgroundColor: isDark
          ? PRIMARY_ENTRY_SLIDE.backgroundColorDark
          : PRIMARY_ENTRY_SLIDE.backgroundColorLight,
        accentColor: isDark
          ? PRIMARY_ENTRY_SLIDE.accentColorDark
          : PRIMARY_ENTRY_SLIDE.accentColorLight,
      }]
    : [];
  const proposalSlide: CarouselSlide[] = showProposalCard
    ? [{ type: "proposal" as const, campaignId: "proposal-event" }]
    : [];
  const realSlides: CarouselSlide[] = hasSearchQuery
    ? [...eventSlides, ...identitySlide, ...proposalSlide]
    : [...identitySlide, ...eventSlides, ...proposalSlide];

  const N = realSlides.length; // logical count
  // Peeking cards are a wide-web treatment. On native they force the 480px
  // minimum card into compact phone windows, clipping event information and
  // detaching the controls from the visible slide. Native keeps every slide
  // within its page width instead.
  const isSingleSlide = N <= 1;
  const usePeekingCarousel = Platform.OS === "web" && !selectedEvent && N >= 3;
  const infiniteSlides = useMemo(() => withInfiniteClones(realSlides), [realSlides]);
  const CLONE_OFFSET = 1; // physical index 0 = clone of last, index 1 = first real

  // Scroll tracking
  const scrollX = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const progress = useSharedValue(0); // auto-play countdown 0→1
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [logicalIndex, setLogicalIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0); // fallback slider only
  const [wrapLock, setWrapLock] = useState(false); // debounce silent wrap-arounds
  const proposalSlideIndex = realSlides.findIndex((slide) => slide.type === "proposal");
  const activeSlideIndex = usePeekingCarousel ? logicalIndex : currentIndex;
  const animateProposal = animationLevel === "full"
    && !reduceMotion
    && proposalSlideIndex >= 0
    && activeSlideIndex === proposalSlideIndex;
  const proposalDriftOne = useSharedValue(0);
  const proposalDriftTwo = useSharedValue(0);
  const proposalGlow = useSharedValue(0);

  useEffect(() => {
    const values = [proposalDriftOne, proposalDriftTwo, proposalGlow];
    values.forEach(cancelAnimation);
    if (!animateProposal) {
      values.forEach((value) => { value.value = 0; });
      return;
    }
    proposalDriftOne.value = withRepeat(
      withTiming(1, { duration: 5800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    proposalDriftTwo.value = withRepeat(
      withTiming(1, { duration: 7400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    proposalGlow.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => values.forEach(cancelAnimation);
  }, [animateProposal, proposalDriftOne, proposalDriftTwo, proposalGlow]);

  const proposalOrbOneStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + proposalGlow.value * 0.3,
    transform: [
      { translateX: interpolate(proposalDriftOne.value, [0, 1], [-18, 22]) },
      { translateY: interpolate(proposalDriftOne.value, [0, 1], [16, -18]) },
      { scale: interpolate(proposalDriftOne.value, [0, 1], [0.94, 1.08]) },
    ],
  }));
  const proposalOrbTwoStyle = useAnimatedStyle(() => ({
    opacity: 0.46 + proposalGlow.value * 0.28,
    transform: [
      { translateX: interpolate(proposalDriftTwo.value, [0, 1], [22, -16]) },
      { translateY: interpolate(proposalDriftTwo.value, [0, 1], [-10, 20]) },
      { scale: interpolate(proposalDriftTwo.value, [0, 1], [1.06, 0.9]) },
    ],
  }));
  const proposalGlossStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + proposalGlow.value * 0.38,
    transform: [{ translateX: interpolate(proposalGlow.value, [0, 1], [-20, 20]) }],
  }));

  const physicalToOffset = useCallback((physIdx: number) => contentPaddingX + physIdx * snapInterval, [contentPaddingX, snapInterval]);

  // Center the first card on mount so it's the middle visible card on wide
  // screens instead of sitting at the far-left edge of the viewport.
  useEffect(() => {
    if (usePeekingCarousel && N >= 1) {
      // Small delay so the layout is painted before we scroll
      requestAnimationFrame(() => {
        // Scroll to center the first real slide (physical index 1)
        scrollViewRef.current?.scrollTo({ x: contentPaddingX, animated: false });
        // Sync activeIndex immediately — onScroll may not fire synchronously
        // for the programmatic scroll, especially on web.
        activeIndex.value = CLONE_OFFSET; // = 1, first real slide
        scrollX.value = contentPaddingX;
      });
    }
  }, [usePeekingCarousel, N, contentPaddingX]);

  const onScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const x = event.nativeEvent.contentOffset.x;
    scrollX.value = x;
    // Derive physical index from scroll position
    const physIdx = Math.round((x - contentPaddingX) / snapInterval);
    activeIndex.value = physIdx;

    // Silent wrap during scroll: if we're near a clone position, snap to the
    // real slide without animation. This catches cases where momentumEnd
    // doesn't fire reliably on web.
    if (wrapLock) return;
    if (physIdx === 0 && N > 1) {
      setWrapLock(true);
      // Snap to the real last slide (phys N) — same position visually
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ x: physicalToOffset(N), animated: false });
        // Release the lock after the scroll settles
        setTimeout(() => setWrapLock(false), 100);
      });
    }
    if (physIdx === N + 1 && N > 1) {
      setWrapLock(true);
      // Snap to the real first slide (phys 1) — same position visually
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollTo({ x: physicalToOffset(1), animated: false });
        setTimeout(() => setWrapLock(false), 100);
      });
    }
  }, [scrollX, activeIndex, contentPaddingX, snapInterval, N, physicalToOffset, wrapLock]);

  const onMomentumScrollEnd = useCallback(() => {
    if (wrapLock) return;
    const physIdx = Math.round((scrollX.value - contentPaddingX) / snapInterval);
    // Wrap: clone_last (phys 0) → real last (phys N)
    if (physIdx === 0 && N > 1) {
      setWrapLock(true);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: physicalToOffset(N), animated: false });
        setWrapLock(false);
      }, 150);
    }
    // Wrap: clone_first (phys N+1) → real first (phys 1)
    if (physIdx === N + 1 && N > 1) {
      setWrapLock(true);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: physicalToOffset(1), animated: false });
        setWrapLock(false);
      }, 150);
    }
  }, [scrollX, contentPaddingX, physicalToOffset, N, wrapLock]);

  const scrollToPhysical = useCallback((physIdx: number, animated = true) => {
    scrollViewRef.current?.scrollTo({ x: physicalToOffset(physIdx), animated });
  }, [physicalToOffset]);

  const scrollToLogical = useCallback((logIdx: number) => {
    scrollToPhysical(logIdx + CLONE_OFFSET);
  }, [scrollToPhysical]);

  const scrollToFallbackSlide = useCallback((index: number) => {
    scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  }, [screenWidth]);

  useEffect(() => {
    if (!hasSearchQuery) return;
    requestAnimationFrame(() => {
      if (usePeekingCarousel) {
        setLogicalIndex(0);
        scrollToPhysical(CLONE_OFFSET, false);
      } else {
        setCurrentIndex(0);
        scrollToFallbackSlide(0);
      }
    });
  }, [hasSearchQuery, searchQuery, scrollToFallbackSlide, scrollToPhysical, usePeekingCarousel]);

  const handleEventPress = (event: EventInfo) => {
    if (onEventPress) onEventPress(event);
  };
  const getEventStartDate = (event: EventInfo): string | undefined => event.eventStartDate;

  const styles = getStyles(isDark, colors, isMobile, screenWidth, cardWidth);

  // Auto-play with progress tracking
  const isAutoPlayPausedRef = useRef(false);
  const timerStartRef = useRef(Date.now());

  // Progress ticker: updates progress 0→1 during each auto-play interval
  useEffect(() => {
    if (!autoPlay || N <= 1) return;
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      if (isAutoPlayPausedRef.current) {
        // Pause progress at current value
        raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = Date.now() - timerStartRef.current;
      const p = Math.min(1, elapsed / autoPlayInterval);
      progress.value = p;
      if (p >= 1) {
        progress.value = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [autoPlay, N, autoPlayInterval, progress]);

  // Auto-play advance timer
  useEffect(() => {
    if (!autoPlay || N <= 1) return;
    timerStartRef.current = Date.now();
    progress.value = 0;

    const interval = setInterval(() => {
      if (isAutoPlayPausedRef.current) return;
      if (usePeekingCarousel) {
        setLogicalIndex((prev) => {
          // We're at the last real slide → advance to clone_first (N+1) for the wrap animation.
          if (prev === N - 1) {
            scrollToPhysical(N + 1);
            return 0;
          }
          scrollToPhysical(prev + CLONE_OFFSET + 1);
          return (prev + 1) % N;
        });
      } else {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % N;
          scrollToFallbackSlide(next);
          return next;
        });
      }
      timerStartRef.current = Date.now();
      progress.value = 0;
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [
    autoPlay,
    autoPlayInterval,
    N,
    progress,
    scrollToFallbackSlide,
    scrollToPhysical,
    usePeekingCarousel,
  ]);

  // Sync logical index from scroll position
  useEffect(() => {
    if (!usePeekingCarousel) return;
    let raf: ReturnType<typeof requestAnimationFrame> | undefined;
    const tick = () => {
      const physIdx = Math.round(activeIndex.value);
      // Map physical to logical
      let log = physIdx - CLONE_OFFSET;
      if (log < 0) log = N - 1; // clone of last
      if (log >= N) log = 0; // clone of first
      setLogicalIndex((prev) => (prev === log ? prev : log));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [activeIndex, N, usePeekingCarousel]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => {
      const next = !p;
      isAutoPlayPausedRef.current = !next;
      if (next) {
        timerStartRef.current = Date.now();
        progress.value = 0;
      }
      return next;
    });
  }, [progress]);

  // Press pause on carousel touch
  const handleCarouselPressIn = useCallback(() => {
    isAutoPlayPausedRef.current = true;
  }, []);
  const handleCarouselPressOut = useCallback(() => {
    isAutoPlayPausedRef.current = false;
  }, []);

  const handleTickPress = useCallback((idx: number) => {
    setLogicalIndex(idx);
    scrollToLogical(idx);
    timerStartRef.current = Date.now();
    progress.value = 0;
  }, [scrollToLogical, progress]);

  const moveToSlide = useCallback((index: number) => {
    if (usePeekingCarousel) {
      setLogicalIndex(index);
      scrollToLogical(index);
    } else {
      setCurrentIndex(index);
      scrollToFallbackSlide(index);
    }
    timerStartRef.current = Date.now();
    progress.value = 0;
  }, [progress, scrollToFallbackSlide, scrollToLogical, usePeekingCarousel]);

  const handlePrevious = useCallback(() => {
    const next = (activeSlideIndex - 1 + N) % N;
    moveToSlide(next);
  }, [N, activeSlideIndex, moveToSlide]);

  const handleNext = useCallback(() => {
    moveToSlide((activeSlideIndex + 1) % N);
  }, [N, activeSlideIndex, moveToSlide]);

  // Restart: jump back to the first slide with a pause so the user can
  // see the reset before auto-play kicks back in.
  const handleRestart = useCallback(() => {
    isAutoPlayPausedRef.current = true;
    setLogicalIndex(0);
    scrollToLogical(0);
    timerStartRef.current = Date.now();
    progress.value = 0;
    // Wait ~1.5s before resuming auto-play so the reset is visible
    setTimeout(() => {
      isAutoPlayPausedRef.current = false;
      timerStartRef.current = Date.now();
      progress.value = 0;
    }, 1500);
  }, [scrollToLogical, progress]);

  // --- Web-only: mouse drag to scroll ---
  const handlePointerDown = useCallback((e: any) => {
    if (e.pointerType === 'touch') return;
    dragRef.current = { startX: e.clientX, scrollStart: scrollX.value };
    isDraggingRef.current = false;
    if (e.currentTarget) e.currentTarget.style.cursor = 'grabbing';
    // Pause auto-play so dragging doesn't fight the carousel
    isAutoPlayPausedRef.current = true;
  }, [scrollX]);

  const handlePointerMove = useCallback((e: any) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 4) isDraggingRef.current = true;
    const newX = dragRef.current.scrollStart - dx;
    scrollViewRef.current?.scrollTo({ x: Math.max(0, newX), animated: false });
  }, []);

  const handlePointerUp = useCallback((e: any) => {
    if (e?.currentTarget) e.currentTarget.style.cursor = 'grab';
    dragRef.current = null;
    // Resume auto-play after a short delay so the snap animation finishes
    setTimeout(() => { isAutoPlayPausedRef.current = false; }, 800);
  }, []);

  const handlePointerCancel = useCallback((e: any) => {
    if (e?.currentTarget) e.currentTarget.style.cursor = 'grab';
    dragRef.current = null;
    isDraggingRef.current = false;
    setTimeout(() => { isAutoPlayPausedRef.current = false; }, 800);
  }, []);

  // --- Web-only: vertical scroll wheel → horizontal scroll ---
  const handleWheel = useCallback((e: any) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      // Pause auto-play while the user is wheeling through slides
      isAutoPlayPausedRef.current = true;
      const currentX = scrollX.value;
      // Map vertical wheel to horizontal scroll — snap to nearest card
      const delta = e.deltaY > 0 ? snapInterval : -snapInterval;
      const targetX = Math.max(0, currentX + delta);
      scrollViewRef.current?.scrollTo({ x: targetX, animated: true });
      // Resume after snap settles (cancel any previous resume timer)
      clearTimeout(wheelResumeRef.current);
      wheelResumeRef.current = setTimeout(() => { isAutoPlayPausedRef.current = false; }, 1200);
    }
  }, [scrollX, snapInterval]);

  // Render slide content
  const renderSlideContent = useCallback((slide: CarouselSlide) => {
    if (slide.type === "event") {
      if (!slide.event || !slide.banner) return null;
      const event = slide.event;
      const banner = slide.banner;
      const localizedBanner = localizeEventBannerSlide(banner, translate);
      const lampBranding = lampBrandingByEvent[event.id];
      const resolvedLampBrandLogo = lampBranding?.logoSrcDark || lampBranding?.logoSrcLight || lampBranding?.logoFallbackSrc;
      const shouldUseLampBanner = Platform.OS === "web" && slide.useEventBranding && Boolean(resolvedLampBrandLogo);

      const bannerContent = shouldUseLampBanner ? (
        <LampBrandBanner
          isDarkMode={isDark}
          logoSrcDark={lampBranding?.logoSrcDark}
          logoSrcLight={lampBranding?.logoSrcLight}
          logoFallbackSrc={lampBranding?.logoFallbackSrc}
          logoAlt={lampBranding?.logoAlt}
          backgroundColor={LOGO_SLIDE_BACKGROUND}
          accentColor={event.color}
        />
      ) : (
        <EventBanner
          title={localizedBanner.title}
          subtitle={localizedBanner.subtitle}
          date={localizedBanner.date}
          backgroundColor={localizedBanner.backgroundColor}
          showCountdown={shouldShowEventBannerCountdown(event.eventStartDate)}
          showLiveIndicator={banner.media.type !== "video" && Boolean(event.eventStartDate)}
          eventStartDate={getEventStartDate(event)}
          isLive={false}
          eventId={event.id}
          eventImage={banner.media.type === "image" ? banner.media.url : undefined}
          eventImageTextOverlaySafe={banner.media.type === "image" && banner.media.textOverlaySafe === true}
          eventShortName={event.shortName}
          eventVideo={banner.media.type === "video" ? banner.media.url : undefined}
          eventLabel={localizedBanner.eyebrow || event.recurrenceLabel}
          ctaLabel={localizedBanner.cta?.label}
          ctaUrl={localizedBanner.cta?.url}
          ctaPosition={localizedBanner.cta?.position}
          showCta={showCtas}
        />
      );

      return (
        <View style={styles.cardInner}>
          <View style={styles.eventBannerWrapper}>
            {bannerContent}
          </View>
          {/* Soft gradient fade at the bottom edge of the card — replaces the
              hard straight-line cutoff with a smooth transparency transition. */}
          <View style={styles.bottomFadeOverlay} pointerEvents="none">
            <SafeLinearGradient
              colors={[
                "transparent",
                isDark ? "rgba(7,7,10,0.3)" : "rgba(248,250,252,0.3)",
                isDark ? "rgba(7,7,10,0.6)" : "rgba(248,250,252,0.6)",
              ]}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      );
    }

    if (slide.type === "logo") {
      return (
        <View style={styles.cardInner}>
          <View style={[styles.logoSlideContainer, { backgroundColor: slide.backgroundColor || LOGO_SLIDE_BACKGROUND, shadowColor: "#000000" }]}>
            <SafeLinearGradient
              colors={[hexToRgba(slide.accentColor || "#6FDDFD", 0.48), hexToRgba(slide.accentColor || "#6FDDFD", 0.16), "transparent"]}
              locations={[0, 0.34, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.lightBeamOverlay}
            />
            <Image
              source={isDark && slide.logoSrcDark ? slide.logoSrcDark : slide.logoSrcLight || slide.logoSrc}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          {/* Same soft bottom-edge gradient for logo slides. */}
          <View style={styles.bottomFadeOverlay} pointerEvents="none">
            <SafeLinearGradient
              colors={[
                "transparent",
                isDark ? "rgba(7,7,10,0.3)" : "rgba(248,250,252,0.3)",
                isDark ? "rgba(7,7,10,0.6)" : "rgba(248,250,252,0.6)",
              ]}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      );
    }
    if (slide.type === "campaign" && slide.campaignSrc) {
      return (
        <View style={styles.cardInner}>
          <Image
            source={slide.campaignSrc}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.campaignImage}
            resizeMode={slide.campaignFit || "cover"}
          />
          {slide.campaignLogoSrc && (
            <View style={[
              styles.campaignBranding,
              slide.campaignCompactBranding && styles.campaignBrandingCompact,
            ]}>
              <Image
                source={slide.campaignLogoSrc}
                accessible={false}
                style={[
                  styles.campaignLogo,
                  slide.campaignCompactBranding && styles.campaignLogoCompact,
                ]}
                resizeMode="contain"
              />
              {(slide.campaignLocation || slide.campaignDate) && (
                <View style={styles.campaignMetadata}>
                  <Text style={styles.campaignLocation}>{slide.campaignLocation}</Text>
                  <Text style={styles.campaignDate}>{slide.campaignDate}</Text>
                </View>
              )}
            </View>
          )}
          {slide.campaignCity && (
            <Text style={styles.campaignCity}>{slide.campaignCity}</Text>
          )}
          {slide.campaignFederationLogoSrc && slide.campaignMinDeporteLogoSrc && (
            <View style={styles.campaignAffiliations}>
              <View style={styles.campaignAffiliationLogos}>
                <View style={styles.campaignFederationMembership}>
                  <Text style={styles.campaignAffiliationLabel}>
                    {translate("landingCarousel.memberOf", "Member of")}
                  </Text>
                  <View style={styles.campaignFederationLogoSurface}>
                    <Image
                      source={slide.campaignFederationLogoSrc}
                      accessible={false}
                      style={styles.campaignFederationLogo}
                      resizeMode="contain"
                    />
                  </View>
                </View>
                <View style={styles.campaignAffiliationDivider} />
                <View style={styles.campaignSupporters}>
                  <Text style={styles.campaignAffiliationLabel}>
                    {translate("landingCarousel.supportedBy", "Supported by")}
                  </Text>
                  <View style={styles.campaignSupporterLogos}>
                    <Image
                      source={slide.campaignMinDeporteLogoSrc}
                      accessible={false}
                      style={styles.campaignMinDeporteLogo}
                      resizeMode="contain"
                    />
                    {slide.campaignInderLogoSrc && (
                      <>
                        <View style={styles.campaignSupporterDivider} />
                        <Image
                          source={slide.campaignInderLogoSrc}
                          accessible={false}
                          style={styles.campaignInderLogo}
                          resizeMode="contain"
                        />
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>
          )}
          <View style={styles.bottomFadeOverlay} pointerEvents="none">
            <SafeLinearGradient
              colors={["transparent", "rgba(7,7,10,0.14)", "rgba(7,7,10,0.34)"]}
              locations={[0, 0.4, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      );
    }
    if (slide.type === "proposal") {
      return (
        <View style={styles.cardInner}>
          <SafeLinearGradient
            colors={isDark ? ["#07111F", "#102A38", "#0D1724"] : ["#F7FBFC", "#E7F8FB", "#F8FAFC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.proposalCard}
          >
            <Animated.View style={[styles.proposalOrbOne, proposalOrbOneStyle]} pointerEvents="none" />
            <Animated.View style={[styles.proposalOrbTwo, proposalOrbTwoStyle]} pointerEvents="none" />
            <Animated.View style={[styles.proposalGloss, proposalGlossStyle]} pointerEvents="none">
              <SafeLinearGradient
                colors={["transparent", isDark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.7)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
            <Text style={styles.proposalEyebrow}>
              {translate("eventProposal.cardEyebrow", "MAKE IT YOURS")}
            </Text>
            <Text style={styles.proposalTitle}>
              {translate("eventProposal.cardTitle", "Your event belongs here")}
            </Text>
            <Text style={styles.proposalBody}>
              {translate(
                "eventProposal.cardBody",
                "Bring your event, club or community to HASHPASS and give people one beautiful place to discover it.",
              )}
            </Text>
            <ActionButton
              onPress={onProposeEvent}
              mode={isDark ? "dark" : "light"}
              variant="primary"
              label={translate("eventProposal.action", "Propose an event")}
              leadingIcon={proposalActionIcon}
              style={styles.proposalAction}
              accessibilityLabel={translate("eventProposal.action", "Propose an event")}
              {...(Platform.OS === "web"
                ? ({
                    onMouseEnter: () => onProposalActionHoverChange?.(true),
                    onMouseLeave: () => onProposalActionHoverChange?.(false),
                  } as any)
                : {})}
            />
          </SafeLinearGradient>
        </View>
      );
    }
    return null;
  }, [isDark, translate, lampBrandingByEvent, showCtas, onEventPress, onProposeEvent, styles, proposalOrbOneStyle, proposalOrbTwoStyle, proposalGlossStyle]);

  // Web-only wheel wrapper props (typed as `any` because RN's ViewProps omits onWheel)
  const wheelViewProps: any = { style: styles.carouselWrapper, onWheel: handleWheel };
  const hasFooterActions = Boolean(footerLeadingAction || footerAction);
  const stackFooter = shouldStackCarouselFooter(isMobile, screenWidth, Platform.OS);
  const renderIndicators = () => {
    if (!showDotIndicators || N <= 1) return null;

    return usePeekingCarousel && autoPlay ? (
      <CarouselTickPill
        count={N}
        activeIndex={activeIndex}
        progress={progress}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onIndexPress={handleTickPress}
        onRestart={handleRestart}
      />
    ) : (
      <View style={styles.dotsFallback}>
        {realSlides.map((_, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.dot, index === currentIndex && styles.dotActive]}
            onPress={() => {
              setCurrentIndex(index);
              scrollToFallbackSlide(index);
            }}
            onPressIn={handleCarouselPressIn}
            onPressOut={handleCarouselPressOut}
          />
        ))}
      </View>
    );
  };

  const showWideSearch = showEventSearch && Platform.OS === "web" && !isMobile;
  const showCompactWebDiscovery = showEventSearch && Platform.OS === "web" && isMobile;
  const renderDirectionControls = () => N > 1 ? (
    <>
      <IconButton
        mode={isDark ? "dark" : "light"}
        label={translate("eventSearch.previous", "Previous slide")}
        onPress={handlePrevious}
        style={styles.directionButton}
      >
        <MorphIcon
          icon={LucideChevronLeft}
          size={20}
          color={isDark ? "#E2E8F0" : "#334155"}
          strokeWidth={2}
          fallbackIconName="chevron-back"
        />
      </IconButton>
      {renderIndicators()}
      <IconButton
        mode={isDark ? "dark" : "light"}
        label={translate("eventSearch.next", "Next slide")}
        onPress={handleNext}
        style={styles.directionButton}
      >
        <MorphIcon
          icon={LucideChevronRight}
          size={20}
          color={isDark ? "#E2E8F0" : "#334155"}
          strokeWidth={2}
          fallbackIconName="chevron-forward"
        />
      </IconButton>
    </>
  ) : renderIndicators();

  return (
    <View style={styles.container}>
      {usePeekingCarousel ? (
        <View {...wheelViewProps}>
          {showWideSearch ? (
            <View style={styles.searchOverlay}>
              <Animated.View style={[styles.searchGlass, searchShellAnimatedStyle]}>
                <TouchableOpacity
                  testID="carousel-search-trigger"
                  style={styles.searchTrigger}
                  accessibilityRole="button"
                  accessibilityLabel={translate("eventSearch.accessibilityLabel", "Search events in the carousel")}
                  onPress={() => {
                    setIsSearchExpanded(true);
                    requestAnimationFrame(() => searchInputRef.current?.focus());
                  }}
                >
                  <MorphIcon
                    icon={LucideSearch}
                    size={18}
                    color={isDark ? "#A5F3FC" : "#0E7490"}
                    strokeWidth={2}
                    fallbackIconName="search"
                  />
                </TouchableOpacity>
                <Animated.View
                  style={[styles.searchInputWrap, searchInputAnimatedStyle]}
                  pointerEvents={shouldExpandSearch ? "auto" : "none"}
                >
                  <TextInput
                    ref={searchInputRef}
                    testID="carousel-search-input"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setIsSearchExpanded(true)}
                    onBlur={() => {
                      if (!hasSearchQuery) setIsSearchExpanded(false);
                    }}
                    placeholder={translate("eventSearch.placeholder", "Search events")}
                    placeholderTextColor={isDark ? "#94A3B8" : "#64748B"}
                    style={styles.searchInput}
                    className="hp-carousel-search-input"
                    accessibilityLabel={translate("eventSearch.accessibilityLabel", "Search events in the carousel")}
                    returnKeyType="search"
                  />
                </Animated.View>
              </Animated.View>
              {onExploreEvents ? (
                <Animated.View
                  style={[styles.searchGlass, styles.explorerGlass, explorerShellAnimatedStyle]}
                  {...(Platform.OS === "web"
                    ? ({
                        onMouseLeave: () => {
                          onExplorerActionHoverChange?.(false);
                          setIsExplorerExpanded(false);
                        },
                      } as any)
                    : {})}
                >
                  {isExplorerExpanded ? (
                    <Animated.View
                      style={[
                        styles.explorerExpandedContent,
                        { width: expandedExplorerWidth },
                        explorerActionContentAnimatedStyle,
                      ]}
                    >
                      <ActionButton
                        testID="carousel-explorer-action"
                        mode={isDark ? "dark" : "light"}
                        variant="ghost"
                        label={translate("eventSearch.exploreAll", "Explore all")}
                        accessibilityState={{ expanded: true }}
                        leadingIcon={explorerActionIcon || (
                          <MorphIcon
                            icon={LucideCompass}
                            size={17}
                            color={isDark ? "#67E8F9" : "#0E7490"}
                            strokeWidth={2}
                            fallbackIconName="compass-outline"
                          />
                        )}
                        onPress={onExploreEvents}
                        onBlur={() => setIsExplorerExpanded(false)}
                        style={styles.explorerInlineAction}
                        {...(Platform.OS === "web"
                          ? ({ onMouseEnter: () => onExplorerActionHoverChange?.(true) } as any)
                          : {})}
                      />
                    </Animated.View>
                  ) : (
                    <IconButton
                      testID="carousel-explorer-expand-trigger"
                      mode={isDark ? "dark" : "light"}
                      label={translate("eventSearch.exploreAll", "Explore all events")}
                      accessibilityState={{ expanded: false }}
                      onPress={() => setIsExplorerExpanded(true)}
                      style={styles.explorerCircularTrigger}
                      {...(Platform.OS === "web"
                        ? ({
                            onMouseEnter: () => {
                              onExplorerActionHoverChange?.(true);
                              setIsExplorerExpanded(true);
                            },
                          } as any)
                        : {})}
                    >
                      {explorerActionIcon || (
                        <MorphIcon
                          icon={LucideCompass}
                          size={18}
                          color={isDark ? "#67E8F9" : "#0E7490"}
                          strokeWidth={2}
                          fallbackIconName="compass-outline"
                        />
                      )}
                    </IconButton>
                  )}
                </Animated.View>
              ) : null}
            </View>
          ) : null}
          <ScrollView
            ref={scrollViewRef}
            horizontal
            snapToInterval={snapInterval}
            snapToAlignment="center"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            onMomentumScrollEnd={onMomentumScrollEnd}
            scrollEventThrottle={16}
            style={styles.scrollView}
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: contentPaddingX }]}
            onTouchStart={handleCarouselPressIn}
            onTouchEnd={handleCarouselPressOut}
            onTouchCancel={handleCarouselPressOut}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {infiniteSlides.map((slide, physIdx) => {
              const key = slide.type === "logo"
                ? `clone-${slide.logoId}-${physIdx}`
                : slide.type === "campaign"
                  ? `clone-${slide.campaignId}-${physIdx}`
                  : slide.type === "proposal"
                    ? `clone-${slide.campaignId}-${physIdx}`
                : `clone-${slide.event?.id}-${slide.banner?.id}-${physIdx}`;
              return (
                <AnimatedCard key={key} activeIndex={activeIndex} index={physIdx} cardWidth={cardWidth}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole={slide.type === "campaign" ? "button" : undefined}
                    accessibilityLabel={slide.type === "campaign"
                      ? slide.campaignAccessibilityLabel
                      : slide.type === "proposal"
                        ? translate("eventProposal.cardTitle", "Your event belongs here")
                        : undefined}
                    onPress={() => {
                      // A drag ends with a browser click. Always discard it
                      // before dispatching any card action, including proposal.
                      if (isDraggingRef.current) {
                        isDraggingRef.current = false;
                        return;
                      }
                      if (slide.type === "campaign" && slide.event) {
                        handleEventPress(slide.event);
                        return;
                      }
                      if (slide.type === "proposal") {
                        onProposeEvent?.();
                        return;
                      }
                      // First click: center this card and pause auto-play so the
                      // user can inspect it.
                      const physCenter = physIdx;
                      const targetX = contentPaddingX + physCenter * snapInterval;
                      scrollViewRef.current?.scrollTo({ x: targetX, animated: true });
                      isAutoPlayPausedRef.current = true;
                      setTimeout(() => { isAutoPlayPausedRef.current = false; }, 3000);
                    }}
                    style={{ flex: 1 }}
                  >
                    {renderSlideContent(slide)}
                  </TouchableOpacity>
                </AnimatedCard>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <View {...wheelViewProps}>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(event: any) => {
              const idx = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
              setCurrentIndex(idx);
            }}
            scrollEventThrottle={16}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContentFallback}
            onTouchStart={handleCarouselPressIn}
            onTouchEnd={handleCarouselPressOut}
            onTouchCancel={handleCarouselPressOut}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
          {realSlides.map((slide) => {
            const key = slide.type === "logo"
              ? slide.logoId!
              : slide.type === "campaign"
                ? slide.campaignId!
                : slide.type === "proposal"
                  ? slide.campaignId!
                : `${slide.event?.id}:${slide.banner?.id}`;

            if (slide.type === "campaign" && slide.event) {
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={slide.campaignAccessibilityLabel}
                  onPress={() => handleEventPress(slide.event!)}
                  style={styles.slideFullWidth}
                >
                  {renderSlideContent(slide)}
                </TouchableOpacity>
              );
            }

            if (slide.type === "proposal") {
              return <View key={key} style={styles.slideFullWidth}>{renderSlideContent(slide)}</View>;
            }

            return (
              <View key={key} style={styles.slideFullWidth}>
                {renderSlideContent(slide)}
              </View>
            );
          })}
        </ScrollView>
        </View>
      )}

      {((showDotIndicators && N > 1) || hasFooterActions) ? (
        <View
          style={[
            styles.footer,
            ((stackFooter && hasFooterActions) || showCompactWebDiscovery) && styles.footerMobile,
          ]}
          testID="carousel-footer"
        >
          {showCompactWebDiscovery ? (
            <View style={styles.compactWebDiscovery}>
              <View style={styles.compactWebField}>
                <FormField
                  testID="carousel-search-input"
                  mode={isDark ? "dark" : "light"}
                  label={translate("eventSearch.placeholder", "Search events")}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={translate("eventSearch.placeholder", "Search events")}
                  style={styles.compactWebSearchInput}
                  className="hp-carousel-search-input"
                  accessibilityLabel={translate("eventSearch.accessibilityLabel", "Search events in the carousel")}
                />
              </View>
              {onExploreEvents ? (
                <IconButton
                  testID="carousel-explorer-expand-trigger"
                  mode={isDark ? "dark" : "light"}
                  label={translate("eventSearch.exploreAll", "Explore all events")}
                  onPress={onExploreEvents}
                >
                  {explorerActionIcon || <MorphIcon icon={LucideCompass} size={18} color={isDark ? "#67E8F9" : "#0E7490"} strokeWidth={2} fallbackIconName="compass-outline" />}
                </IconButton>
              ) : null}
            </View>
          ) : null}
          {stackFooter && hasFooterActions ? (
            <>
              <View
                style={styles.footerActionsMobile}
                testID="carousel-footer-actions"
              >
                {footerLeadingAction ? (
                  <View style={styles.footerLeadingAction}>{footerLeadingAction}</View>
                ) : null}
                {footerAction ? (
                  <View style={styles.footerAction}>{footerAction}</View>
                ) : null}
              </View>
              {showDotIndicators && N > 1 ? (
                <View
                  style={styles.footerIndicatorMobile}
                  testID="carousel-footer-indicators"
                >
                  {renderIndicators()}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.footerCenter}>
              {footerLeadingAction ? (
                <View style={styles.footerLeadingAction}>{footerLeadingAction}</View>
              ) : null}
              {renderDirectionControls()}
              {footerAction ? (
                <View style={styles.footerAction}>{footerAction}</View>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const getStyles = (
  isDark: boolean,
  colors: any,
  isMobile: boolean,
  _screenWidth: number,
  cardWidth: number,
) =>
  {
    const cardHeight = resolveCarouselCardHeight(isMobile, _screenWidth);
    const cardMediaHeight = cardHeight - 8;

    return StyleSheet.create({
    container: {
      width: "100%",
      marginBottom: 32,
    },
    carouselWrapper: {
      width: "100%",
      position: "relative",
    },
    searchOverlay: {
      position: "absolute",
      zIndex: 8,
      top: uiTokens.space.lg,
      right: Math.max(uiTokens.space.sm, (_screenWidth - cardWidth) / 2 + uiTokens.space.xs),
      maxWidth: Math.min(468, Math.max(236, cardWidth * 0.62)),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: uiTokens.space.xs,
    },
    searchGlass: {
      minHeight: uiTokens.control.minHeight,
      borderRadius: uiTokens.radius.pill,
      borderWidth: uiTokens.control.borderWidth,
      borderColor: isDark ? "rgba(165,243,252,0.32)" : "rgba(14,116,144,0.24)",
      backgroundColor: isDark ? "rgba(7,17,31,0.76)" : "rgba(255,255,255,0.78)",
      alignItems: "center",
      flexDirection: "row",
      overflow: "hidden",
      paddingRight: uiTokens.space.xs,
      shadowColor: isDark ? "#000000" : "#0E7490",
      shadowOffset: { width: 0, height: uiTokens.space.xs },
      shadowOpacity: isDark ? 0.24 : 0.13,
      shadowRadius: uiTokens.space.lg,
      elevation: 7,
      ...(Platform.OS === "web"
        ? ({ backdropFilter: "blur(24px) saturate(1.2)", WebkitBackdropFilter: "blur(24px) saturate(1.2)" } as any)
        : {}),
    },
    searchTrigger: {
      width: uiTokens.control.minHeight,
      minHeight: uiTokens.control.minHeight,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    searchInputWrap: {
      flex: 1,
      minWidth: 0,
      minHeight: uiTokens.control.minHeight,
      justifyContent: "center",
      paddingRight: uiTokens.space.sm,
    },
    searchInput: {
      minWidth: 0,
      flex: 1,
      minHeight: uiTokens.control.minHeight,
      color: isDark ? "#F8FAFC" : "#0F172A",
      caretColor: isDark ? "#A5F3FC" : "#0E7490",
      fontSize: uiTokens.type.label,
      fontWeight: "600",
      paddingVertical: 0,
      backgroundColor: "transparent",
      borderWidth: 0,
      borderColor: "transparent",
      ...(Platform.OS === "web"
        ? ({ outlineStyle: "none", outlineColor: "transparent", outlineWidth: 0, boxShadow: "none" } as any)
        : {}),
    },
    explorerInlineAction: {
      minHeight: uiTokens.control.minHeight,
      paddingHorizontal: uiTokens.space.md,
      flexShrink: 0,
      width: "100%",
      // The glass shell is the only visible surface. Keeping the shared
      // ActionButton transparent avoids a nested light ellipse on web.
      backgroundColor: "transparent",
      borderColor: "transparent",
      borderWidth: 0,
      borderRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
    },
    explorerGlass: {
      minHeight: uiTokens.control.minHeight,
      paddingRight: 0,
      flexShrink: 0,
    },
    explorerExpandedContent: {
      minHeight: uiTokens.control.minHeight,
    },
    explorerCircularTrigger: {
      width: "100%",
      height: "100%",
      borderWidth: 0,
    },
    scrollView: {
      flexGrow: 0,
      height: cardHeight,
    },
    scrollContent: {
      alignItems: "center",
      height: cardHeight,
    },
    // Fallback slider styles (full-width paging, no peeking)
    scrollContentFallback: {
      alignItems: "center",
      height: cardHeight,
    },
    slideFullWidth: {
      width: _screenWidth,
      height: cardHeight,
      paddingHorizontal: 16,
      justifyContent: "center",
    },
    dotsFallback: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)",
    },
    dotActive: {
      width: 24,
      backgroundColor: isDark ? "#FFFFFF" : "#000000",
    },
    cardInner: {
      width: "100%", // parent AnimatedCard sets the actual width
      // The uniform inset keeps media clear of every rounded edge, including
      // the lower corners that looked clipped on compact phones.
      height: cardHeight,
      borderRadius: CARD_BORDER_RADIUS,
      overflow: "hidden",
      padding: 4,
      // No shadow — the gradient overlay handles the bottom edge softly.
      // A box shadow would create a visible halo line around the rounded corners.
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
    },
    eventBannerWrapper: {
      width: "100%",
      height: cardMediaHeight,
      borderRadius: CARD_BORDER_RADIUS - 2,
      overflow: "hidden",
      position: "relative",
    },
    // Gradient overlay that fades the bottom edge of the card smoothly
    // instead of cutting with a hard straight line.
    bottomFadeOverlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 80,
      zIndex: 2,
      pointerEvents: "none",
    },
    footer: {
      minHeight: 48,
      marginTop: 16,
      paddingHorizontal: isMobile ? 12 : 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    footerMobile: {
      flexDirection: "column",
    },
    footerCenter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: isMobile ? 8 : 16,
      maxWidth: 680,
      width: "100%",
    },
    directionButton: {
      shadowColor: isDark ? "#000000" : "#0F172A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.24 : 0.1,
      shadowRadius: 7,
      elevation: 3,
    },
    footerActionsMobile: {
      width: "100%",
      flexDirection: isMobile && _screenWidth < 360 ? "column" : "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    compactWebDiscovery: {
      width: "100%", minHeight: 44, flexDirection: "row", alignItems: "center", gap: uiTokens.space.sm,
      paddingHorizontal: uiTokens.space.md, marginBottom: uiTokens.space.sm,
    },
    compactWebSearchInput: {
      minWidth: 0,
    },
    compactWebField: {
      flex: 1, minWidth: 0,
    },
    footerIndicatorMobile: {
      minHeight: 44,
      marginTop: 8,
      width: "100%",
      maxWidth: "100%",
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    footerLeadingAction: {
      flex: isMobile ? 1 : undefined,
      minWidth: 0,
      flexShrink: 1,
      width: isMobile && _screenWidth < 360 ? "100%" : undefined,
    },
    footerAction: {
      flex: isMobile ? 1 : undefined,
      minWidth: 0,
      flexShrink: 1,
      width: isMobile && _screenWidth < 360 ? "100%" : undefined,
    },
    logoSlideContainer: {
      width: "100%",
      height: cardMediaHeight,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
      borderRadius: CARD_BORDER_RADIUS,
      overflow: "hidden",
      position: "relative",
      shadowOffset: { width: 0, height: -20 },
      shadowOpacity: 0.3,
      shadowRadius: 40,
      elevation: 8,
    },
    logoImage: {
      width: isMobile ? 320 : 480,
      height: isMobile ? 152 : 229,
      maxWidth: "100%",
      alignSelf: "center",
      resizeMode: "contain",
    },
    campaignImage: {
      width: "100%",
      height: cardMediaHeight,
      borderRadius: CARD_BORDER_RADIUS - 2,
    },
    proposalCard: {
      flex: 1,
      minHeight: cardMediaHeight,
      borderRadius: CARD_BORDER_RADIUS - 2,
      overflow: "hidden",
      paddingHorizontal: isMobile ? 28 : 56,
      paddingVertical: isMobile ? 32 : 52,
      justifyContent: "center",
      position: "relative",
    },
    proposalOrbOne: {
      position: "absolute",
      width: isMobile ? 180 : 280,
      height: isMobile ? 180 : 280,
      borderRadius: isMobile ? 90 : 140,
      right: isMobile ? -72 : -88,
      top: isMobile ? -72 : -96,
      backgroundColor: isDark ? "rgba(34,211,238,0.2)" : "rgba(8,145,178,0.13)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(103,232,249,0.35)" : "rgba(8,145,178,0.24)",
    },
    proposalOrbTwo: {
      position: "absolute",
      width: isMobile ? 120 : 190,
      height: isMobile ? 120 : 190,
      borderRadius: isMobile ? 60 : 95,
      left: isMobile ? -42 : -58,
      bottom: isMobile ? -48 : -70,
      backgroundColor: isDark ? "rgba(14,165,233,0.17)" : "rgba(103,232,249,0.28)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(125,211,252,0.28)" : "rgba(14,116,144,0.2)",
    },
    proposalGloss: {
      position: "absolute",
      top: "-20%",
      right: "20%",
      width: "30%",
      height: "145%",
      transform: [{ rotate: "18deg" }],
    },
    proposalEyebrow: {
      color: isDark ? "#67E8F9" : "#0E7490",
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 2,
      marginBottom: 14,
    },
    proposalTitle: {
      color: isDark ? "#F8FAFC" : "#0F172A",
      fontSize: isMobile ? 30 : 40,
      lineHeight: isMobile ? 36 : 46,
      fontWeight: "800",
      letterSpacing: -0.8,
      maxWidth: 520,
    },
    proposalBody: {
      color: isDark ? "#B8C7D5" : "#475569",
      fontSize: isMobile ? 15 : 17,
      lineHeight: isMobile ? 23 : 26,
      marginTop: 14,
      maxWidth: 520,
    },
    proposalAction: {
      alignSelf: "flex-start",
      marginTop: 24,
    },
    campaignBranding: {
      position: "absolute",
      top: 36,
      left: 28,
      right: 28,
      alignItems: "center",
      zIndex: 3,
    },
    campaignBrandingCompact: {
      alignItems: "flex-start",
    },
    campaignLogo: {
      width: "100%",
      height: isMobile ? 154 : 180,
    },
    // campaign* styles below render text/badges directly over real organizer
    // campaign photography, not app chrome — colors/radii are fixed per DESIGN.md's
    // "event artwork" exception (does not redefine app controls) rather than
    // sourced from the theme palette. See packages/ui/design-debt.json.
    campaignLogoCompact: {
      width: isMobile ? 180 : 216,
      height: isMobile ? 88 : 106,
      borderRadius: 12,
      overflow: "hidden",
    },
    campaignMetadata: {
      marginTop: 14,
      alignItems: "center",
      gap: 6,
    },
    campaignLocation: {
      color: "#FFFFFF",
      fontSize: isMobile ? 16 : 18,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      textAlign: "center",
      textShadowColor: "rgba(0, 0, 0, 0.72)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    campaignDate: {
      color: "#FFE47A",
      fontSize: isMobile ? 14 : 16,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      textAlign: "center",
      textShadowColor: "rgba(0, 0, 0, 0.72)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    campaignCity: {
      position: "absolute",
      right: 28,
      bottom: 28,
      zIndex: 3,
      color: "#FFFFFF",
      fontSize: isMobile ? 15 : 17,
      fontWeight: "700",
      letterSpacing: 0.7,
      textTransform: "uppercase",
      textShadowColor: "rgba(0, 0, 0, 0.72)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 6,
    },
    campaignAffiliations: {
      position: "absolute",
      left: 28,
      bottom: 24,
      zIndex: 3,
      alignItems: "flex-start",
    },
    campaignFederationMembership: {
      alignItems: "flex-start",
    },
    campaignSupporters: {
      alignItems: "flex-start",
    },
    campaignAffiliationLabel: {
      color: "rgba(255, 255, 255, 0.78)",
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.1,
      textTransform: "uppercase",
      marginBottom: 4,
    },
    campaignAffiliationLogos: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    campaignSupporterLogos: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    campaignFederationLogoSurface: {
      width: isMobile ? 112 : 132,
      height: isMobile ? 52 : 60,
      borderRadius: 10,
      padding: 3,
      backgroundColor: "rgba(4, 8, 15, 0.74)",
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    campaignFederationLogo: {
      width: "100%",
      height: "100%",
    },
    campaignAffiliationDivider: {
      width: 1,
      height: 28,
      backgroundColor: "rgba(255, 255, 255, 0.38)",
    },
    campaignMinDeporteLogo: {
      width: isMobile ? 76 : 88,
      height: isMobile ? 46 : 52,
    },
    campaignSupporterDivider: {
      width: 1,
      height: 28,
      backgroundColor: "rgba(255, 255, 255, 0.28)",
    },
    campaignInderLogo: {
      width: isMobile ? 72 : 82,
      height: isMobile ? 28 : 32,
    },
    lightBeamOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 150,
      zIndex: 1,
      pointerEvents: "none",
    },
    });
  };
