import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { LukasSettingsMenu } from '../components/LukasSettingsMenu';
import type { LukasAnimationLevel } from '../types/lukas.types';
import { MerchantContactPanel } from '../components/MerchantContactPanel';
import { LukasClaimModal } from '../components/lukas/LukasClaimModal';
import { HeroSection } from '../components/lukas/HeroSection';
import { WhySection } from '../components/lukas/WhySection';
import { HowItWorksSection } from '../components/lukas/HowItWorksSection';
import { MerchantsSection } from '../components/lukas/MerchantsSection';
import { OmniChainSection } from '../components/lukas/OmniChainSection';
import { GetLukasSection } from '../components/lukas/GetLukasSection';
import { FAQSection } from '../components/lukas/FAQSection';
import { LukasFooter } from '../components/lukas/LukasFooter';
import { resolveLukasAnimationLevel } from '../components/lukas/lukas-rewards';
import { LukasRewardWallet, LukasRewardsProvider, useLukasRewards } from '../components/lukas/LukasRewards';
import { LukasMotionContext, useSystemReducedMotion } from '../components/lukas/useLukasMotion';

export default function LukasLanding() {
  return <LukasRewardsProvider><LukasLandingContent /></LukasRewardsProvider>;
}

function LukasLandingContent() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const { state: rewardState, total: rewardTotal, max: rewardMax, rewardDelta, earn, markClaimed } = useLukasRewards();
  const [animationLevel, setAnimationLevel] = useState<LukasAnimationLevel>('full');
  const [claimVisible, setClaimVisible] = useState(false);
  const systemReducedMotion = useSystemReducedMotion();
  const effectiveAnimationLevel = resolveLukasAnimationLevel(animationLevel, systemReducedMotion);

  useEffect(() => {
    AsyncStorage.getItem('lukas.animation.v1').then((value) => {
      if (value === 'full' || value === 'reduced' || value === 'none') setAnimationLevel(value);
    }).catch(() => undefined);
  }, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const styles = getStyles(isDark, colors, isMobile);

  const handleLukasClick = () => {
    const result = earn('hero');
    if (result?.reachedCap) {
      handleScrollToSection('get-lukas');
      setClaimVisible(true);
    }
  };

  useEffect(() => {
    if (rewardState.total >= rewardMax && !rewardState.claimed) setClaimVisible(true);
  }, [rewardMax, rewardState.claimed, rewardState.total]);

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
    <LukasMotionContext.Provider value={effectiveAnimationLevel}>
    <View style={styles.container}>
      <LukasRewardWallet onOpenClaim={() => setClaimVisible(true)} />
      <View style={styles.settingsTrigger}>
        <LukasSettingsMenu animation={animationLevel} onAnimationChange={setAnimationLevel} />
      </View>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <HeroSection 
          onGetLukas={handleLukasClick}
          onForMerchants={() => handleScrollToSection('merchants')}
          rewardTotal={rewardTotal}
          rewardMax={rewardMax}
          rewardDelta={rewardDelta}
          rewardClaimed={rewardState.claimed}
          animationLevel={effectiveAnimationLevel}
        />
        
        <View id="why" style={[styles.section, styles.sectionRaised]}>
          <WhySection />
        </View>

        <View id="how-it-works" style={styles.section}>
          <HowItWorksSection />
        </View>

        <View id="merchants" style={[styles.section, styles.sectionRaised]}>
          <MerchantsSection />
          <MerchantContactPanel />
        </View>

        <View id="omnichain" style={styles.section}>
          <OmniChainSection />
        </View>

        <View id="get-lukas" style={[styles.section, styles.sectionRaised]}>
          <GetLukasSection />
        </View>

        <View id="faq" style={styles.section}>
          <FAQSection />
        </View>

        <LukasFooter />
      </Animated.ScrollView>
      <LukasClaimModal
        visible={claimVisible}
        rewardTotal={rewardTotal}
        onClaimed={markClaimed}
        onClose={() => setClaimVisible(false)}
      />
    </View>
    </LukasMotionContext.Provider>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#06111E' : '#F7FAF8',
  },
  settingsTrigger: {
    position: 'absolute',
    top: isMobile ? 16 : 22,
    right: isMobile ? 16 : 28,
    zIndex: 50,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    width: '100%',
    minHeight: 0,
    paddingHorizontal: isMobile ? 20 : 40,
    paddingVertical: isMobile ? 56 : 104,
  },
  sectionRaised: {
    backgroundColor: isDark ? '#091A29' : '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: isDark ? 'rgba(139, 203, 171, 0.12)' : '#DEECE3',
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
