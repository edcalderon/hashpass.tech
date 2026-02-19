import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Image, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useIsMobile } from '@/hooks/useIsMobile';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import EventBanner from './EventBanner';
import { getAvailableEvents, EventInfo } from '../lib/event-detector';

interface CarouselSlide {
  type: 'download' | 'event';
  event?: EventInfo;
}

interface EventBannerCarouselProps {
  showDotIndicators?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  onEventPress?: (event: EventInfo) => void;
}

export default function EventBannerCarousel({
  showDotIndicators = true,
  autoPlay = true,
  autoPlayInterval = 5000,
  onEventPress,
}: EventBannerCarouselProps) {
  const { isDark, colors } = useTheme();
  const isMobile = useIsMobile();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const screenWidth = Dimensions.get('window').width;
  const styles = getStyles(isDark, colors, isMobile);

  // Get available events
  const availableEvents = getAvailableEvents();

  // Build slides: event banners only (download slide temporarily hidden)
  const slides: CarouselSlide[] = [
    // { type: 'download' }, // Temporarily hidden
    ...availableEvents.map(event => ({ type: 'event' as const, event })),
  ];

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
  }, [autoPlay, autoPlayInterval, slides.length]);

  const scrollToSlide = (index: number) => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: index * screenWidth,
        animated: true,
      });
    }
  };

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
  const getEventStartDate = (event: EventInfo): string => {
    return event.eventStartDate || '2025-11-12T09:00:00-05:00';
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

        {/* Event Banner Slides */}
        {slides
          .filter(slide => slide.type === 'event')
          .map((slide, index) => {
            if (!slide.event) return null;
            const event = slide.event;
            return (
              <View key={event.id} style={styles.slide}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleEventPress(event)}
                  style={styles.eventBannerWrapper}
                >
                  <EventBanner
                    title={event.title}
                    subtitle={event.subtitle}
                    date={getEventDate(event)}
                    backgroundColor={event.color}
                    showCountdown={true}
                    showLiveIndicator={true}
                    eventStartDate={getEventStartDate(event)}
                    isLive={false}
                  />
                </TouchableOpacity>
              </View>
            );
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
});

