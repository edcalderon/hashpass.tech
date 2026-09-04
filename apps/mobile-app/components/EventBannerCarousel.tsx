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
  Platform,
  type ImageSourcePropType,
} from "react-native";
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

interface CarouselSlide {
  type: "download" | "event" | "logo";
  event?: EventInfo;
  banner?: ResolvedEventBannerSlide;
  useEventBranding?: boolean;
  logoId?: string;
  logoSrc?: ImageSourcePropType;
  logoSrcDark?: ImageSourcePropType;
  logoSrcLight?: ImageSourcePropType;
  backgroundColor?: string;
  accentColor?: string;
}

interface EventBannerCarouselProps {
  showDotIndicators?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  /** Whether campaign CTA buttons are rendered on event slides. */
  showCtas?: boolean;
  onEventPress?: (event: EventInfo) => void;
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
// Use bundled WebP files on every platform. The web dev server does not serve
// arbitrary `/assets/...` paths, and SVG imports can be interpreted by Metro as
// directory requests (`/logos/bsl`), producing ENOENT and blank carousel cards.
const HASHPASS_DARK_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-white-cyan.webp");
const BSL_COLOMBIA_LOGO = require("../assets/logos/bsl/bsl-colombia-pro.webp");

// Main HASHPASS Logo
const LOGO_SLIDE_BACKGROUND = "#07111F";

// "black" here is the file's historical name, not its rendered color -- see
// the same naming gotcha documented in lib/hashpass-logo.ts. This is the
// solid black-letters/red-mark mark, the same asset getHashpassFullLogo(false)
// already uses for light mode everywhere else in the app (auth screen,
// footer, etc.) -- keep it that way if you touch this.
const HASHPASS_BLACK_RED_LOGO = require("../assets/logos/hashpass/logo-full-hashpass-black.webp");
// A previous attempt swapped only the logo here and kept the dark background,
// which made the black wordmark disappear against it (see git history). This
// time the background is theme-aware too, so black-on-light and
// white-cyan-on-dark both stay readable.
const LOGO_SLIDE_BACKGROUND_LIGHT = "#FFFFFF";

const MAIN_HASHPASS_LOGO = {
  id: "hashpass-main",
  name: "HASHPASS",
  darkSrc: HASHPASS_DARK_LOGO,
  lightSrc: HASHPASS_BLACK_RED_LOGO,
  backgroundColorDark: LOGO_SLIDE_BACKGROUND,
  backgroundColorLight: LOGO_SLIDE_BACKGROUND_LIGHT,
  accentColorDark: "#6FDDFD",
  accentColorLight: "#8B1538",
};

// BSL On Tour, Perú, and Chile were redundant/already-happened tour-stop
// promos (Perú and Chile are done; Colombia is the only real upcoming stop),
// so only the Colombia logo remains -- see the BSL On Tour hero subtitle:
// "Peru and Chile are archived. Colombia is next."
const BSL_COLOMBIA_LOGO_SLIDE = {
  id: "bsl-colombia",
  name: "BSL Colombia 2026",
  logoSrc: BSL_COLOMBIA_LOGO,
  accentColor: "#FFD700",
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
  event: selectedEvent,
  lampBrandingOverrides,
}: EventBannerCarouselProps) {
  const { isDark, colors } = useTheme();
  const { t: translate } = useTranslation();
  const isMobile = useIsMobile();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  // useWindowDimensions (unlike Dimensions.get, a one-time snapshot) re-renders
  // this component on every resize -- required so the slide width tracks the
  // real viewport on an ultra-wide monitor or a window resize after mount,
  // instead of freezing at whatever width was current on the last render that
  // happened to also change isDark/isMobile (confirmed live bug: a resize that
  // stays on the same side of useIsMobile's 768px breakpoint never re-renders,
  // so slides kept the initial narrower width and left a blank gap on the
  // right at ultra-wide viewports).
  const { width: screenWidth } = useWindowDimensions();
  const styles = getStyles(isDark, colors, isMobile, screenWidth);

  // Get available events
  const availableEvents: EventInfo[] = selectedEvent
    ? [selectedEvent]
    : getAvailableEvents();
  const defaultLampBrandingByEvent = useMemo<
    Record<string, LampBrandingConfig>
  >(
    () => ({
      bsl: getLampBrandConfig("bsl") || {
        logoAlt: "BSL On Tour",
      },
      peru2026: getLampBrandConfig("peru2026") || {
        logoAlt: "BSL Perú 2026",
      },
      chile2026: getLampBrandConfig("chile2026") || {
        logoAlt: "BSL Chile 2026",
      },
      colombia2026: getLampBrandConfig("colombia2026") || {
        logoAlt: "BSL Colombia 2026",
      },
      bsl2025: getLampBrandConfig("bsl2025") || {
        logoAlt: "BSL 2025 Archive",
      },
    }),
    [],
  );

  const lampBrandingByEvent = useMemo<Record<string, LampBrandingConfig>>(
    () => ({
      ...defaultLampBrandingByEvent,
      ...(lampBrandingOverrides || {}),
    }),
    [defaultLampBrandingByEvent, lampBrandingOverrides],
  );

  // The HASHPASS/BSL brand logo slides only belong on the global explorer
  // (hashpass.tech, showing every tenant) -- a single-tenant whitelabel
  // domain like demo-criptolatinfest.hashpass.tech must show only its own
  // event, never another tenant's branding (confirmed live bug: these were
  // previously unconditional, so BSL's hero logos and tour cards rendered
  // on every whitelabel tenant's landing page regardless of context).
  const isGlobalTenant = isGlobalEventTenant() && !selectedEvent;

  // The global landing carousel should only promote what's actually
  // happening or coming up. "bsl" is the tour-hub's own fallback banner
  // ("BSL On Tour / Peru, Chile and Colombia 2026 roadshow") which just
  // duplicates the BSL Colombia logo slide below; peru2026, chile2026, and
  // bsl2025 are tour stops that have already happened. Only applies to the
  // global carousel -- a whitelabel tenant's own page (selectedEvent set)
  // must still show its own event regardless of this list.
  const PAST_OR_REDUNDANT_EVENT_IDS = new Set([
    "bsl",
    "peru2026",
    "chile2026",
    "bsl2025",
  ]);
  const carouselEvents = selectedEvent
    ? availableEvents
    : availableEvents.filter(
        (event) => !PAST_OR_REDUNDANT_EVENT_IDS.has(event.id),
      );

  // Real, currently-bookable event banner slides (Hash Poker Room, Colombia
  // 2026, etc.) -- split out Hash Poker Room so it can be pinned right after
  // the HASHPASS logo below, regardless of where getAvailableEvents() would
  // otherwise place it.
  const eventSlides = carouselEvents.flatMap((event) =>
    getEventBannerSlides(event).map((banner: ResolvedEventBannerSlide) => ({
      type: "event" as const,
      event,
      banner,
      // Preserve the established global BSL brand treatment for events
      // without campaign slides. A selected event always renders its own
      // media so selection and banner content stay distinct.
      useEventBranding: !selectedEvent && !event.bannerSlides?.length,
    })),
  );
  const hashPokerSlides = eventSlides.filter(
    (slide) => slide.event.id === "hash-poker",
  );
  const otherEventSlides = eventSlides.filter(
    (slide) => slide.event.id !== "hash-poker",
  );

  // Build slides: HASHPASS logo, then BSL Colombia, then other real events,
  // Hash Poker Room last.
  const slides: CarouselSlide[] = [
    // { type: 'download' }, // Temporarily hidden
    ...(isGlobalTenant
      ? [
          // Main HASHPASS logo always leads the carousel. Background and
          // logo mark are paired per theme (dark bg + white-cyan mark in
          // dark mode, white bg + black-red mark in light mode) so the
          // wordmark is always readable against its own slide.
          {
            type: "logo" as const,
            logoId: MAIN_HASHPASS_LOGO.id,
            logoSrcDark: MAIN_HASHPASS_LOGO.darkSrc,
            logoSrcLight: MAIN_HASHPASS_LOGO.lightSrc,
            backgroundColor: isDark
              ? MAIN_HASHPASS_LOGO.backgroundColorDark
              : MAIN_HASHPASS_LOGO.backgroundColorLight,
            accentColor: isDark
              ? MAIN_HASHPASS_LOGO.accentColorDark
              : MAIN_HASHPASS_LOGO.accentColorLight,
          },
          // BSL's own mark is white-on-dark only -- keep its slide on the
          // dark brand surface regardless of app theme.
          {
            type: "logo" as const,
            logoId: BSL_COLOMBIA_LOGO_SLIDE.id,
            logoSrc: BSL_COLOMBIA_LOGO_SLIDE.logoSrc,
            backgroundColor: LOGO_SLIDE_BACKGROUND,
            accentColor: BSL_COLOMBIA_LOGO_SLIDE.accentColor,
          },
        ]
      : []),
    ...otherEventSlides,
    ...hashPokerSlides,
  ];

  const scrollToSlide = useCallback(
    (index: number) => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          x: index * screenWidth,
          animated: true,
        });
      }
    },
    [screenWidth],
  );

  // Auto-play functionality. Pressing and holding the carousel pauses it
  // (isAutoPlayPausedRef, toggled by onPressIn/onPressOut below) rather than
  // stopping the interval outright, so it resumes on release without losing
  // its cadence.
  const isAutoPlayPausedRef = useRef(false);

  useEffect(() => {
    if (!autoPlay || slides.length <= 1) return;

    const interval = setInterval(() => {
      if (isAutoPlayPausedRef.current) return;
      setCurrentIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollToSlide(next);
        return next;
      });
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, slides.length, scrollToSlide]);

  const handleCarouselPressIn = useCallback(() => {
    isAutoPlayPausedRef.current = true;
  }, []);

  const handleCarouselPressOut = useCallback(() => {
    isAutoPlayPausedRef.current = false;
  }, []);

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    setCurrentIndex(index);
  };

  const handleEventPress = (event: EventInfo) => {
    if (onEventPress) {
      onEventPress(event);
    }
  };

  // Get event date for countdown from event data
  const getEventStartDate = (event: EventInfo): string | undefined => {
    return event.eventStartDate;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onTouchStart={handleCarouselPressIn}
        onTouchEnd={handleCarouselPressOut}
        onTouchCancel={handleCarouselPressOut}
      >
        {/* Mobile App Download Slide - Temporarily hidden */}
        {/* <View style={styles.slide}>
          <View style={styles.downloadSection}>
            <Text style={styles.downloadTitle}>📱 Download Our Mobile App</Text>
            <Text style={styles.downloadSubtitle}>Get the best experience with our native mobile app</Text>
            
            <View style={styles.qrCodeContainer}>
              <Image 
                source={require('../assets/images/qr-one-link-hashpass.webp')}
                style={styles.qrCode}
                resizeMode="contain"
              />
            </View>
            
            <Text style={styles.scanText}>Scan QR code to download</Text>
            
            <View style={styles.storeButtonsContainer}>
              <TouchableOpacity 
                style={[styles.storeButton, styles.appStoreButton]}
                onPress={() => Linking.openURL('https://onelink.to/4px5bv')}
              >
                <View style={styles.storeButtonContent}>
                  <View style={styles.storeIcon}>
                    <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.storeTextContainer}>
                    <Text style={styles.storeButtonSubtext}>Download on the</Text>
                    <Text style={styles.storeButtonMaintext}>App Store</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.storeButton, styles.googlePlayButton]}
                onPress={() => Linking.openURL('https://onelink.to/4px5bv')}
              >
                <View style={styles.storeButtonContent}>
                  <View style={styles.storeIcon}>
                    <Ionicons name="logo-google-playstore" size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.storeTextContainer}>
                    <Text style={styles.storeButtonSubtext}>GET IT ON</Text>
                    <Text style={styles.storeButtonMaintext}>Google Play</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View> */}

        {slides.map((slide) => {
          if (slide.type === "event") {
            if (!slide.event) return null;

            const event = slide.event;
            const banner = slide.banner;
            if (!banner) return null;
            const localizedBanner = localizeEventBannerSlide(banner, translate);
            const lampBranding = lampBrandingByEvent[event.id];
            const resolvedLampBrandLogo =
              lampBranding?.logoSrcDark ||
              lampBranding?.logoSrcLight ||
              lampBranding?.logoFallbackSrc;
            const shouldUseLampBanner =
              Platform.OS === "web" &&
              slide.useEventBranding &&
              Boolean(resolvedLampBrandLogo);

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
                // The countdown belongs to the event context, not its media.
                // Clean video and approved image slides both retain it.
                showCountdown={shouldShowEventBannerCountdown(
                  event.eventStartDate,
                )}
                showLiveIndicator={
                  banner.media.type !== "video" && Boolean(event.eventStartDate)
                }
                eventStartDate={getEventStartDate(event)}
                isLive={false}
                eventId={event.id}
                eventImage={
                  banner.media.type === "image" ? banner.media.url : undefined
                }
                eventImageTextOverlaySafe={
                  banner.media.type === "image" &&
                  banner.media.textOverlaySafe === true
                }
                eventShortName={event.shortName}
                eventVideo={
                  banner.media.type === "video" ? banner.media.url : undefined
                }
                eventLabel={localizedBanner.eyebrow || event.recurrenceLabel}
                ctaLabel={localizedBanner.cta?.label}
                ctaUrl={localizedBanner.cta?.url}
                ctaPosition={localizedBanner.cta?.position}
                showCta={showCtas}
              />
            );

            return (
              <View key={`${event.id}:${banner.id}`} style={styles.slide}>
                {onEventPress ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => handleEventPress(event)}
                    style={styles.eventBannerWrapper}
                  >
                    {bannerContent}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.eventBannerWrapper}>{bannerContent}</View>
                )}
              </View>
            );
          }

          if (slide.type === "logo") {
            return (
              <View key={slide.logoId} style={styles.slide}>
                <View
                  style={[
                    styles.logoSlideContainer,
                    {
                      backgroundColor:
                        slide.backgroundColor || LOGO_SLIDE_BACKGROUND,
                      shadowColor: "#000000",
                    },
                  ]}
                >
                  {/* Light beam effect at top */}
                  <SafeLinearGradient
                    colors={[
                      hexToRgba(slide.accentColor || "#6FDDFD", 0.48),
                      hexToRgba(slide.accentColor || "#6FDDFD", 0.16),
                      "transparent",
                    ]}
                    locations={[0, 0.34, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.lightBeamOverlay}
                  />
                  <Image
                    source={
                      isDark && slide.logoSrcDark
                        ? slide.logoSrcDark
                        : slide.logoSrcLight || slide.logoSrc
                    }
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            );
          }

          return null;
        })}
      </ScrollView>

      {/* Dot Indicators */}
      {showDotIndicators && slides.length > 1 && (
        <View style={styles.indicatorsContainer}>
          {slides.map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.dot, index === currentIndex && styles.dotActive]}
              onPress={() => {
                setCurrentIndex(index);
                scrollToSlide(index);
              }}
              onPressIn={handleCarouselPressIn}
              onPressOut={handleCarouselPressOut}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const getStyles = (
  isDark: boolean,
  colors: any,
  isMobile: boolean,
  screenWidth: number,
) =>
  StyleSheet.create({
    // Keep logo-only and event-banner slides in one fixed viewport so swiping
    // between tour stops never changes the surrounding landing-page layout.
    container: {
      width: "100%",
      marginBottom: 32,
    },
    scrollView: {
      flexGrow: 0,
      height: isMobile ? 420 : 460,
    },
    scrollContent: {
      alignItems: "center",
      height: isMobile ? 420 : 460,
    },
    slide: {
      width: screenWidth,
      paddingHorizontal: 16,
      justifyContent: "center",
      height: isMobile ? 420 : 460,
    },
    downloadSection: {
      padding: 32,
      borderRadius: 2 * 16,
      alignItems: "center",
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(0, 0, 0, 0.02)",
      borderWidth: 1,
      borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
      minHeight: 360,
      justifyContent: "center",
    },
    downloadTitle: {
      fontSize: isMobile ? 24 : 32,
      fontWeight: "800",
      color: isDark ? "#FFFFFF" : "#121212",
      textAlign: "center",
      marginBottom: 8,
      letterSpacing: -0.5,
    },
    downloadSubtitle: {
      fontSize: isMobile ? 16 : 18,
      color: isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.6)",
      textAlign: "center",
      marginBottom: 24,
      lineHeight: 24,
    },
    qrCodeContainer: {
      marginBottom: 16,
      padding: 16,
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      shadowColor: "rgba(0, 0, 0, 0.1)",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 4,
    },
    qrCode: {
      width: isMobile ? 150 : 200,
      height: isMobile ? 150 : 200,
    },
    scanText: {
      fontSize: isMobile ? 14 : 16,
      color: isDark ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.7)",
      textAlign: "center",
      marginBottom: 24,
      fontWeight: "500",
    },
    storeButtonsContainer: {
      flexDirection: "row",
      gap: 16,
      justifyContent: "center",
      flexWrap: "wrap",
    },
    storeButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      minWidth: 140,
      alignItems: "center",
      shadowColor: "rgba(0, 0, 0, 0.2)",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1,
      shadowRadius: 4,
      elevation: 3,
    },
    appStoreButton: {
      backgroundColor: "#000000",
    },
    googlePlayButton: {
      backgroundColor: "#000000",
    },
    storeButtonContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    storeIcon: {
      width: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
    },
    storeTextContainer: {
      alignItems: "flex-start",
    },
    storeButtonSubtext: {
      fontSize: 10,
      fontWeight: "400",
      color: "#FFFFFF",
      lineHeight: 12,
      letterSpacing: 0.5,
    },
    storeButtonMaintext: {
      fontSize: 16,
      fontWeight: "600",
      color: "#FFFFFF",
      lineHeight: 18,
      letterSpacing: 0.3,
    },
    eventBannerWrapper: {
      width: "100%",
      height: isMobile ? 420 : 460,
      borderRadius: 16,
      overflow: "hidden",
    },
    indicatorsContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 16,
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: isDark
        ? "rgba(255, 255, 255, 0.3)"
        : "rgba(0, 0, 0, 0.3)",
    },
    dotActive: {
      width: 24,
      backgroundColor: isDark ? "#FFFFFF" : "#000000",
    },
    logoSlideContainer: {
      width: "100%",
      height: isMobile ? 420 : 460,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
      borderRadius: 16,
      overflow: "hidden",
      position: "relative",
      shadowOffset: { width: 0, height: -20 },
      shadowOpacity: 0.3,
      shadowRadius: 40,
      elevation: 8,
    },
    logoImage: {
      // bsl-ontour-pro is 1660x791 (~2.1:1). A fixed height here (previously
      // 280) mismatched that ratio and let the logo render oversized/clipped
      // on narrow screens instead of scaling down with the container.
      // Use concrete dimensions instead of width: 100% + maxWidth. React
      // Native Web can resolve that combination against the scroll content
      // width (rather than the slide), which pushes the logo off-screen and
      // leaves the event slide looking empty.
      width: isMobile ? 320 : 480,
      height: isMobile ? 152 : 229,
      maxWidth: "100%",
      alignSelf: "center",
      resizeMode: "contain",
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
