import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { useIsMobile } from '@/hooks/useIsMobile';
import EventBanner from './EventBanner';
import LampBrandBanner from './LampBrandBanner';
import { getAvailableEvents, EventInfo } from '../lib/event-detector';
import { getLampBrandConfig } from '../lib/event-branding';

interface CarouselSlide {
  type: 'download' | 'event' | 'logo';
  event?: EventInfo;
  logoId?: string;
  logoSrc?: string;
  logoSrcDark?: any;
  logoSrcLight?: any;
  backgroundColor?: string;
  accentColor?: string;
}

interface EventBannerCarouselProps {
  showDotIndicators?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  onEventPress?: (event: EventInfo) => void;
  lampBrandingOverrides?: Record<string, LampBrandingConfig>;
}

export interface LampBrandingConfig {
  logoSrcDark?: string;
  logoSrcLight?: string;
  logoFallbackSrc?: string;
  logoAlt: string;
}

const HASHPASS_DARK_LOGO = require('../assets/logos/hashpass/logo-full-hashpass-white-cyan.svg');
const HASHPASS_LIGHT_LOGO = require('../assets/logos/hashpass/logo-full-hashpass-black.svg');
const BSL_WHITE_BRAND_LOGO = require('../assets/logos/bsl/bsl-white.png');
const BSL_ONTOUR_LOGO = require('../assets/logos/bsl/bsl-ontour-pro.svg');
const BSL_PERU_LOGO = require('../assets/logos/bsl/bsl-peru-pro.svg');
const BSL_CHILE_LOGO = require('../assets/logos/bsl/bsl-chile-pro.svg');
const BSL_COLOMBIA_LOGO = require('../assets/logos/bsl/bsl-colombia-pro.svg');

// Main HashPass Logo
const LOGO_SLIDE_BACKGROUND = '#07111F';

const MAIN_HASHPASS_LOGO = {
  id: 'hashpass-main',
  name: 'HashPass',
  darkSrc: HASHPASS_DARK_LOGO,
  lightSrc: HASHPASS_LIGHT_LOGO,
  backgroundColor: LOGO_SLIDE_BACKGROUND,
  accentColor: '#6FDDFD',
};

const BSL_PLAIN_LOGO = {
  id: 'bsl-plain',
  name: 'Blockchain Summit Latam',
  darkSrc: BSL_WHITE_BRAND_LOGO,
  lightSrc: BSL_WHITE_BRAND_LOGO,
  backgroundColor: LOGO_SLIDE_BACKGROUND,
  accentColor: '#6FDDFD',
};

// BSL Event Logos with brand colors
const BSL_LOGOS = [
  {
    id: 'bsl-on-tour',
    name: 'BSL On Tour',
    logoSrc: BSL_ONTOUR_LOGO,
    accentColor: '#34D399',
  },
  {
    id: 'bsl-peru',
    name: 'BSL Perú 2026',
    logoSrc: BSL_PERU_LOGO,
    accentColor: '#E31C23',
  },
  {
    id: 'bsl-chile',
    name: 'BSL Chile 2026',
    logoSrc: BSL_CHILE_LOGO,
    accentColor: '#FF5B5B',
  },
  {
    id: 'bsl-colombia',
    name: 'BSL Colombia 2026',
    logoSrc: BSL_COLOMBIA_LOGO,
    accentColor: '#FFD700',
  },
];

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '').trim();
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
  onEventPress,
  lampBrandingOverrides,
}: EventBannerCarouselProps) {
  const { isDark, colors } = useTheme();
  const isMobile = useIsMobile();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const styles = getStyles(isDark, colors, isMobile);

  // Get available events
  const availableEvents = getAvailableEvents();
  const defaultLampBrandingByEvent = useMemo<Record<string, LampBrandingConfig>>(
    () => ({
      bsl: getLampBrandConfig('bsl') || {
        logoAlt: 'BSL On Tour',
      },
      peru2026: getLampBrandConfig('peru2026') || {
        logoAlt: 'BSL Perú 2026',
      },
      chile2026: getLampBrandConfig('chile2026') || {
        logoAlt: 'BSL Chile 2026',
      },
      colombia2026: getLampBrandConfig('colombia2026') || {
        logoAlt: 'BSL Colombia 2026',
      },
      bsl2025: getLampBrandConfig('bsl2025') || {
        logoAlt: 'BSL 2025 Archive',
      },
    }),
    []
  );

  const lampBrandingByEvent = useMemo<Record<string, LampBrandingConfig>>(
    () => ({
      ...defaultLampBrandingByEvent,
      ...(lampBrandingOverrides || {}),
    }),
    [defaultLampBrandingByEvent, lampBrandingOverrides]
  );

  // Build slides: event banners + logo slides
  const slides: CarouselSlide[] = [
    // { type: 'download' }, // Temporarily hidden
    // Add main HashPass logo first
    {
      type: 'logo' as const,
      logoId: MAIN_HASHPASS_LOGO.id,
      logoSrcDark: MAIN_HASHPASS_LOGO.darkSrc,
      logoSrcLight: MAIN_HASHPASS_LOGO.lightSrc,
      backgroundColor: MAIN_HASHPASS_LOGO.backgroundColor,
      accentColor: MAIN_HASHPASS_LOGO.accentColor,
    },
    // Add BSL plain logo second
    {
      type: 'logo' as const,
      logoId: BSL_PLAIN_LOGO.id,
      logoSrcDark: BSL_PLAIN_LOGO.darkSrc,
      logoSrcLight: BSL_PLAIN_LOGO.lightSrc,
      backgroundColor: BSL_PLAIN_LOGO.backgroundColor,
      accentColor: BSL_PLAIN_LOGO.accentColor,
    },
    // Add BSL event logos with brand colors
    ...BSL_LOGOS.map(logo => ({
      type: 'logo' as const,
      logoId: logo.id,
      logoSrc: logo.logoSrc,
      backgroundColor: MAIN_HASHPASS_LOGO.backgroundColor,
      accentColor: logo.accentColor,
    })),
    ...availableEvents.map(event => ({ type: 'event' as const, event })),
  ];

  const scrollToSlide = useCallback((index: number) => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: index * screenWidth,
        animated: true,
      });
    }
  }, [screenWidth]);

  // Auto-play functionality
  useEffect(() => {
    if (!autoPlay || slides.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollToSlide(next);
        return next;
      });
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [autoPlay, autoPlayInterval, slides.length, scrollToSlide]);

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

  const getEventDate = (event: EventInfo): string => {
    return event.eventDateString || event.subtitle || 'Coming Soon';
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
      >
        {/* Mobile App Download Slide - Temporarily hidden */}
        {/* <View style={styles.slide}>
          <View style={styles.downloadSection}>
            <Text style={styles.downloadTitle}>📱 Download Our Mobile App</Text>
            <Text style={styles.downloadSubtitle}>Get the best experience with our native mobile app</Text>
            
            <View style={styles.qrCodeContainer}>
              <Image 
                source={require('../assets/images/qr-one-link-hashpass.png')} 
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
          if (slide.type === 'event') {
            if (!slide.event) return null;

            const event = slide.event;
            const lampBranding = lampBrandingByEvent[event.id];
            const shouldUseLampBanner = Platform.OS === 'web' && Boolean(lampBranding);

            return (
              <View key={event.id} style={styles.slide}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleEventPress(event)}
                  style={styles.eventBannerWrapper}
                >
                  {shouldUseLampBanner ? (
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
                      title={event.title}
                      subtitle={event.subtitle}
                      date={getEventDate(event)}
                      backgroundColor={event.color}
                      showCountdown={Boolean(event.eventStartDate)}
                      showLiveIndicator={Boolean(event.eventStartDate)}
                      eventStartDate={getEventStartDate(event)}
                      isLive={false}
                      eventImage={event.image}
                    />
                  )}
                </TouchableOpacity>
              </View>
            );
          }

          if (slide.type === 'logo') {
            return (
              <View key={slide.logoId} style={styles.slide}>
                <View
                  style={[
                    styles.logoSlideContainer,
                    {
                      backgroundColor: slide.backgroundColor || LOGO_SLIDE_BACKGROUND,
                      shadowColor: '#000000',
                    },
                  ]}
                >
                  {/* Light beam effect at top */}
                  <LinearGradient
                    colors={[
                      hexToRgba(slide.accentColor || '#6FDDFD', 0.48),
                      hexToRgba(slide.accentColor || '#6FDDFD', 0.16),
                      'transparent',
                    ]}
                    locations={[0, 0.34, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.lightBeamOverlay}
                  />
                  <Image
                    source={isDark && slide.logoSrcDark ? slide.logoSrcDark : (slide.logoSrcLight || slide.logoSrc)}
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
              style={[
                styles.dot,
                index === currentIndex && styles.dotActive,
              ]}
              onPress={() => {
                setCurrentIndex(index);
                scrollToSlide(index);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 32,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    alignItems: 'center',
  },
  slide: {
    width: Dimensions.get('window').width,
    paddingHorizontal: 16,
    justifyContent: 'center',
    minHeight: 400,
  },
  downloadSection: {
    padding: 32,
    borderRadius: 2 * 16,
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    minHeight: 360,
    justifyContent: 'center',
  },
  downloadTitle: {
    fontSize: isMobile ? 24 : 32,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#121212',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  downloadSubtitle: {
    fontSize: isMobile ? 16 : 18,
    color: isDark ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  qrCodeContainer: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: 'rgba(0, 0, 0, 0.1)',
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
    color: isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  storeButtonsContainer: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  storeButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  appStoreButton: {
    backgroundColor: '#000000',
  },
  googlePlayButton: {
    backgroundColor: '#000000',
  },
  storeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeTextContainer: {
    alignItems: 'flex-start',
  },
  storeButtonSubtext: {
    fontSize: 10,
    fontWeight: '400',
    color: '#FFFFFF',
    lineHeight: 12,
    letterSpacing: 0.5,
  },
  storeButtonMaintext: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 18,
    letterSpacing: 0.3,
  },
  eventBannerWrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 360,
  },
  indicatorsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
  },
  dotActive: {
    width: 24,
    backgroundColor: isDark ? '#FFFFFF' : '#000000',
  },
  logoSlideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    borderRadius: 16,
    minHeight: 360,
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 8,
  },
  logoImage: {
    width: '100%',
    height: 280,
  },
  lightBeamOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    zIndex: 1,
    pointerEvents: 'none',
  },
});
