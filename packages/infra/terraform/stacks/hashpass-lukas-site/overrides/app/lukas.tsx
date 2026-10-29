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
import { lukasPalette } from '../components/lukas/lukas-ui';
import { uiTokens } from '@hashpass/ui/tokens';

export default function LukasLanding() {
  return <LukasRewardsProvider><LukasLandingContent /></LukasRewardsProvider>;
}

function LukasLandingContent() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<ScrollView>(null);
  const { state: rewardState, total: rewardTotal, max: rewardMax, rewardDelta, earn, markClaimed, hydrated: rewardHydrated } = useLukasRewards();
  const [animationLevel, setAnimationLevel] = useState<LukasAnimationLevel>('full');
  const [claimVisible, setClaimVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const systemReducedMotion = useSystemReducedMotion();
  const effectiveAnimationLevel = resolveLukasAnimationLevel(animationLevel, systemReducedMotion);
  const palette = lukasPalette(isDark);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroRewardHandledRef = useRef(false);

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

  useEffect(() => {
    if (rewardState.completed.hero) heroRewardHandledRef.current = true;
  }, [rewardState.completed.hero]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showMoreRewardsToast = () => {
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3600);
  };

  const handleLukasClick = () => {
    if (!rewardHydrated) return;
    if (heroRewardHandledRef.current || rewardState.completed.hero) {
      heroRewardHandledRef.current = true;
      showMoreRewardsToast();
      return;
    }
    heroRewardHandledRef.current = true;
    const result = earn('hero');
    if (!result?.awarded) {
      showMoreRewardsToast();
      return;
    }
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
      <View style={styles.utilityRow} pointerEvents="box-none">
        <LukasRewardWallet onOpenClaim={() => setClaimVisible(true)} />
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
          getLukasDisabled={!rewardHydrated}
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
      {toastVisible ? (
        <View
          style={[styles.rewardToast, { backgroundColor: palette.cardRaised, borderColor: palette.border }]}
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={[styles.toastDot, { backgroundColor: palette.fill }]} />
          <Text style={[styles.toastText, { color: palette.text }]}>{t('rewards.moreQuestsToast')}</Text>
        </View>
      ) : null}
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
  utilityRow: {
    position: 'absolute',
    top: isMobile ? 16 : 22,
    left: isMobile ? 14 : 28,
    right: isMobile ? 14 : 28,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: uiTokens.space.sm,
  },
  rewardToast: {
    position: 'absolute',
    bottom: isMobile ? uiTokens.space.md : uiTokens.space.lg,
    left: uiTokens.space.md,
    right: uiTokens.space.md,
    maxWidth: 560,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiTokens.space.md,
    borderWidth: uiTokens.control.borderWidth,
    borderRadius: uiTokens.radius.input,
    paddingHorizontal: uiTokens.space.md,
    paddingVertical: uiTokens.space.sm,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    zIndex: 80,
  },
  toastDot: {
    width: 10,
    height: 10,
    borderRadius: uiTokens.radius.circle,
  },
  toastText: {
    flex: 1,
    fontSize: uiTokens.type.body,
    lineHeight: 22,
    fontWeight: '700',
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
