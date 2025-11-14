import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTranslation } from '../i18n/i18n';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import ThemeAndLanguageSwitcher from '../components/ThemeAndLanguageSwitcher';
import { HeroSection } from '../components/lukas/HeroSection';
import { WhySection } from '../components/lukas/WhySection';
import { HowItWorksSection } from '../components/lukas/HowItWorksSection';
import { MerchantsSection } from '../components/lukas/MerchantsSection';
import { OmniChainSection } from '../components/lukas/OmniChainSection';
import { GetLukasSection } from '../components/lukas/GetLukasSection';
import { FAQSection } from '../components/lukas/FAQSection';

export default function LukasLanding() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const styles = getStyles(isDark, colors, isMobile);

  const handleScrollToSection = (sectionId: string) => {
    // For web, use anchor scrolling
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      // For native, we'd need to measure and scroll
      // For now, just log
      console.log('Scroll to:', sectionId);
    }
  };

  return (
    <View style={styles.container}>
      <ThemeAndLanguageSwitcher />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection 
          onGetLukas={() => handleScrollToSection('get-lukas')}
          onForMerchants={() => handleScrollToSection('merchants')}
        />
        
        <View id="why" style={styles.section}>
          <WhySection />
        </View>

        <View id="how-it-works" style={styles.section}>
          <HowItWorksSection />
        </View>

        <View id="merchants" style={styles.section}>
          <MerchantsSection />
        </View>

        <View id="omnichain" style={styles.section}>
          <OmniChainSection />
        </View>

        <View id="get-lukas" style={styles.section}>
          <GetLukasSection />
        </View>

        <View id="faq" style={styles.section}>
          <FAQSection />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {t('footer.text')}
          </Text>
          <Text style={styles.footerSubtext}>
            {t('footer.subtext')}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://hashpass.tech')}
            style={styles.footerLink}
          >
            <Text style={styles.footerLinkText}>{t('footer.link')}</Text>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#050816' : '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    minHeight: isMobile ? 400 : 600,
    paddingHorizontal: isMobile ? 20 : 40,
    paddingVertical: isMobile ? 60 : 100,
  },
  footer: {
    backgroundColor: isDark ? '#0A0A0A' : '#F9FAFB',
    paddingHorizontal: isMobile ? 20 : 40,
    paddingVertical: isMobile ? 40 : 60,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  footerText: {
    fontSize: isMobile ? 16 : 18,
    fontWeight: '600',
    color: isDark ? '#E5E7EB' : '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerSubtext: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  footerLink: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  footerLinkText: {
    fontSize: isMobile ? 14 : 16,
    color: '#22C55E',
    fontWeight: '600',
  },
});

