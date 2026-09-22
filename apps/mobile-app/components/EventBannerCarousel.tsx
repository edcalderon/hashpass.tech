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
  Platform,
  type ImageSourcePropType,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
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

// Apple-style peeking-card carousel constants.
// Cards are wider than phone-size so event banners and logos have proper
// breathing room. On wide screens the card grows and side padding is capped.
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
  type: "download" | "event" | "logo" | "campaign";
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
  /** Restricts the carousel to one selected event and its own campaign slides. */
  event?: EventInfo | null;
  lampBrandingOverrides?: Record<string, LampBrandingConfig>;
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
  event: selectedEvent,
  lampBrandingOverrides,
}: EventBannerCarouselProps) {
  const { isDark, colors } = useTheme();
  const { t: translate } = useTranslation();
  const isMobile = useIsMobile();
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();

  // Drag state for web mouse-grab on the carousel
  const dragRef = useRef<{ startX: number; scrollStart: number } | null>(null);
  const isDraggingRef = useRef(false);
  const wheelResumeRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Responsive card sizing: on wide screens, grow the card and cap the
  // padding so the carousel stays centered with peeking neighbors.
  const dims = resolveCardDimensions(screenWidth);
  const { cardWidth, contentPaddingX, snapInterval } = dims;

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

  // The event registry is already sorted by start date. Keep every event's
  // poster immediately before its detail/countdown slide, so the carousel
  // never separates a campaign image from the information it introduces.
  const eventSlides = orderedCarouselEvents.flatMap((event) => {
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

  const realSlides: CarouselSlide[] = [
    ...(isGlobalTenant
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
      : []),
    ...eventSlides,
  ];

  const N = realSlides.length; // logical count
  // Tenant-specific pages (selectedEvent set) or slides with too few items
  // don't benefit from the peeking-card layout — fall back to the original
  // full-width paging slider to avoid cutting-line and empty-space issues.
  const isSingleSlide = N <= 1;
  const usePeekingCarousel = !selectedEvent && N >= 3;
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

  const handleEventPress = (event: EventInfo) => {
    if (onEventPress) onEventPress(event);
  };
  const getEventStartDate = (event: EventInfo): string | undefined => event.eventStartDate;

  const styles = getStyles(isDark, colors, isMobile, screenWidth);

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
      setLogicalIndex((prev) => {
        // We're at the last real slide → advance to clone_first (N+1) for the wrap animation
        if (prev === N - 1) {
          scrollToPhysical(N + 1);
          return 0; // logical wraps to 0
        }
        const nextPhys = prev + 1 + CLONE_OFFSET + 1; // prev logical + offset + 1
        // Actually: current phys = prev + CLONE_OFFSET, next phys = prev + CLONE_OFFSET + 1
        scrollToPhysical(prev + CLONE_OFFSET + 1);
        return (prev + 1) % N;
      });
      timerStartRef.current = Date.now();
      progress.value = 0;
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, N, scrollToPhysical, progress]);

  // Sync logical index from scroll position
  useEffect(() => {
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
  }, [activeIndex, N]);

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
    return null;
  }, [isDark, translate, lampBrandingByEvent, showCtas, onEventPress, styles]);

  // Web-only wheel wrapper props (typed as `any` because RN's ViewProps omits onWheel)
  const wheelViewProps: any = { style: styles.carouselWrapper, onWheel: handleWheel };

  return (
    <View style={styles.container}>
      {usePeekingCarousel ? (
        <View {...wheelViewProps}>
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
                : `clone-${slide.event?.id}-${slide.banner?.id}-${physIdx}`;
              return (
                <AnimatedCard key={key} activeIndex={activeIndex} index={physIdx} cardWidth={cardWidth}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    accessibilityRole={slide.type === "campaign" ? "button" : undefined}
                    accessibilityLabel={slide.type === "campaign" ? slide.campaignAccessibilityLabel : undefined}
                    onPress={() => {
                      if (slide.type === "campaign" && slide.event) {
                        handleEventPress(slide.event);
                        return;
                      }
                      // Skip if the user was dragging (drag moved the card already)
                      if (isDraggingRef.current) {
                        isDraggingRef.current = false;
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
          {realSlides.map((slide, idx) => (
            <View key={slide.type === "logo" ? slide.logoId! : slide.type === "campaign" ? slide.campaignId! : `${slide.event?.id}:${slide.banner?.id}`} style={styles.slideFullWidth}>
              {renderSlideContent(slide)}
            </View>
          ))}
        </ScrollView>
        </View>
      )}

      {((showDotIndicators && N > 1) || footerLeadingAction || footerAction) ? (
        <View style={styles.footer}>
          <View style={styles.footerCenter}>
            {footerLeadingAction && <View style={styles.footerLeadingAction}>{footerLeadingAction}</View>}
            {showDotIndicators && N > 1 && (
              usePeekingCarousel && autoPlay ? (
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
                        scrollToLogical(index);
                      }}
                      onPressIn={handleCarouselPressIn}
                      onPressOut={handleCarouselPressOut}
                    />
                  ))}
                </View>
              )
            )}
            {footerAction && <View style={styles.footerAction}>{footerAction}</View>}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean, _screenWidth: number) =>
  StyleSheet.create({
    container: {
      width: "100%",
      marginBottom: 32,
    },
    carouselWrapper: {
      width: "100%",
    },
    scrollView: {
      flexGrow: 0,
      height: isMobile ? 500 : 540,
    },
    scrollContent: {
      alignItems: "center",
      height: isMobile ? 500 : 540,
    },
    // Fallback slider styles (full-width paging, no peeking)
    scrollContentFallback: {
      alignItems: "center",
      height: isMobile ? 500 : 540,
    },
    slideFullWidth: {
      width: _screenWidth,
      height: isMobile ? 500 : 540,
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
      // Extra height so the EventBanner's bottom content (countdown, date row)
      // has room and doesn't get clipped by the rounded bottom corners.
      height: isMobile ? 500 : 540,
      borderRadius: CARD_BORDER_RADIUS,
      overflow: "hidden",
      // Small inner gap on sides so content doesn't touch the card curve.
      paddingTop: 4,
      paddingLeft: 4,
      paddingRight: 4,
      // No shadow — the gradient overlay handles the bottom edge softly.
      // A box shadow would create a visible halo line around the rounded corners.
      backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
    },
    eventBannerWrapper: {
      width: "100%",
      height: isMobile ? 496 : 536, // cardInner height minus 4px top padding
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
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    footerCenter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: isMobile ? 8 : 16,
      maxWidth: 600,
      width: "100%",
    },
    footerLeadingAction: {
      flexShrink: 1,
    },
    footerAction: {
      flexShrink: 1,
    },
    logoSlideContainer: {
      width: "100%",
      height: isMobile ? 496 : 536, // matches cardInner minus 4px top padding
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
      height: isMobile ? 496 : 536,
      borderRadius: CARD_BORDER_RADIUS - 2,
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
