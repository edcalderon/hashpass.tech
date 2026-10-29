import React, { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import type { HeroSectionProps } from '../../types/lukas.types';
import { LukasCoin } from './LukasCoin';
import { ActionButton } from '@hashpass/ui/primitives';
import { lukasPalette, lukasSkin } from './lukas-ui';

const PEG_CURRENCIES = ['COP', 'ARS', 'BRL', 'MXN', 'CLP'];
const REWARD_SEGMENTS = Array.from({ length: 10 }, (_, index) => index);

export function HeroSection({ onGetLukas, getLukasDisabled = false, onForMerchants, rewardTotal, rewardMax = 20, rewardDelta, rewardClaimed = false, animationLevel }: HeroSectionProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const [pegCurrencyIndex, setPegCurrencyIndex] = useState(0);
  // Starts at the static export's width (no viewport) so hydration matches; measured after mount.
  const [screenWidth, setScreenWidth] = useState(0);
  const [rewardScale] = useState(() => new Animated.Value(1));
  const [rewardOpacity] = useState(() => new Animated.Value(0));
  const [rewardTranslateY] = useState(() => new Animated.Value(8));

  useEffect(() => {
    if (animationLevel === 'none' || rewardDelta <= 0) return;
    const fullMotion = animationLevel === 'full';
    rewardScale.setValue(fullMotion ? 0.72 : 1);
    rewardOpacity.setValue(1);
    rewardTranslateY.setValue(fullMotion ? 12 : 0);
    const animation = fullMotion
      ? Animated.parallel([
          Animated.spring(rewardScale, { toValue: 1, friction: 5, tension: 150, useNativeDriver: true }),
          Animated.timing(rewardTranslateY, { toValue: -38, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(rewardOpacity, { toValue: 0, duration: 700, delay: 240, useNativeDriver: true }),
        ])
      : Animated.timing(rewardOpacity, { toValue: 0, duration: 280, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [animationLevel, rewardDelta, rewardOpacity, rewardScale, rewardTranslateY]);

  useEffect(() => {
    if (animationLevel === 'none') return;
    const timer = setInterval(() => setPegCurrencyIndex((current) => (current + 1) % PEG_CURRENCIES.length), animationLevel === 'full' ? 2400 : 4800);
    return () => clearInterval(timer);
  }, [animationLevel]);

  useEffect(() => {
    const updateDimensions = () => setScreenWidth(Platform.OS === 'web' && typeof window !== 'undefined' ? window.innerWidth : Dimensions.get('window').width);
    updateDimensions();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
    const subscription = Dimensions.addEventListener('change', updateDimensions);
    return () => subscription.remove();
  }, []);

  const isSmallMobile = screenWidth < 375;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;
  const coinSize = isSmallMobile ? 132 : isMobile ? 152 : isTablet ? 194 : 230;
  const styles = getStyles(isDark, isMobile, isSmallMobile, isTablet);
  const peg = PEG_CURRENCIES[pegCurrencyIndex];
  const palette = lukasPalette(isDark);
  const mode = isDark ? 'dark' : 'light';
  const skin = lukasSkin(palette);

  return (
    <LinearGradient
      colors={isDark ? ['#061524', '#0B2431', '#10263E'] : ['#F6FAF5', '#EEF8F2', '#EDF2FC']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.gridGlow} />
      <View style={styles.content}>
        <View style={styles.visualColumn}>
          <View style={[styles.sceneFrame, { width: coinSize * 1.6, height: coinSize * 1.6 }]}>
            <LukasCoin size={coinSize} animationLevel={animationLevel} />
          </View>
          <View style={styles.pegPill}>
            <View style={styles.pegDot} />
            <Text style={styles.coinPeg}>1 LUKAS = 1 {peg}</Text>
          </View>
        </View>

        <View style={styles.textColumn}>
          <Text style={styles.badge}>{t('hero.badge')}</Text>
          <Text style={styles.title}>
            {t('hero.title')} <Text style={styles.titleHighlight}>{t('hero.titleHighlight')}</Text>{'\n'}
            {t('hero.titleSuffix')} <Text style={styles.titleGreen}>{t('hero.titleGreen')}</Text>.
          </Text>
          <Text style={styles.subtitle}>{t('hero.subtitle')}</Text>

          <View style={styles.actionStack}>
            <View style={styles.buttonRow}>
              <ActionButton mode={mode} skin={skin} label={t('hero.getLukas')} disabled={getLukasDisabled} onPress={onGetLukas} style={styles.heroButton} />
              <ActionButton mode={mode} skin={skin} variant="secondary" label={t('hero.forMerchants')} onPress={onForMerchants} style={styles.heroButton} />
            </View>

            <View style={[styles.rewardPanel, rewardClaimed && styles.rewardPanelClaimed]} accessibilityLiveRegion="polite">
              <View style={styles.rewardHeader}>
                <View>
                  <Text style={styles.rewardOverline}>{rewardClaimed ? t('rewards.claimed') : t('rewards.progress')}</Text>
                  <Text style={styles.rewardPillText}>{rewardClaimed ? t('rewards.claimed') : `${rewardTotal}/${rewardMax} LUKAS`}</Text>
                </View>
                <View style={[styles.rewardOrb, rewardClaimed && styles.rewardOrbClaimed]}><View style={[styles.rewardOrbCore, rewardClaimed && styles.rewardOrbCoreClaimed]} /></View>
                <Animated.Text style={[styles.rewardFloat, { opacity: rewardOpacity, transform: [{ translateY: rewardTranslateY }, { scale: rewardScale }] }]}>+{rewardDelta}</Animated.Text>
              </View>
              <View style={styles.rewardSegments}>
                {REWARD_SEGMENTS.map((segment) => <View key={segment} style={[styles.rewardSegment, segment < Math.ceil((rewardTotal / rewardMax) * REWARD_SEGMENTS.length) && (rewardClaimed ? styles.rewardSegmentClaimed : styles.rewardSegmentFilled)]} />)}
              </View>
            </View>
          </View>

          <View style={styles.badgesContainer}>
            {[`Peg 1:1 ${peg}`, t('hero.badges.merchants'), t('hero.badges.collateral')].map((label) => (
              <View key={label} style={styles.badgeItem}><Text style={styles.badgeText}>{label}</Text></View>
            ))}
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean, isSmallMobile: boolean, isTablet: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    paddingTop: isMobile ? 96 : isTablet ? 116 : 128,
    paddingBottom: isMobile ? 52 : isTablet ? 88 : 112,
    paddingHorizontal: isSmallMobile ? 16 : isMobile ? 20 : 40,
    overflow: 'hidden',
  },
  gridGlow: {
    position: 'absolute',
    width: isMobile ? 310 : 540,
    height: isMobile ? 310 : 540,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(93, 230, 175, 0.16)' : 'rgba(17, 127, 83, 0.12)',
    top: isMobile ? 116 : 92,
    left: isMobile ? -142 : -180,
  },
  content: {
    width: '100%',
    maxWidth: 1160,
    alignSelf: 'center',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: 'center',
    gap: isMobile ? 36 : isTablet ? 56 : 76,
  },
  visualColumn: {
    width: isMobile ? '100%' : undefined,
    ...(isMobile ? { flexGrow: 0, flexShrink: 0 } : { flexGrow: 0.9, flexShrink: 1, flexBasis: 0 }),
    minWidth: 0,
    paddingTop: isMobile ? 36 : 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sceneFrame: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  pegPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 8, minHeight: 36, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: isDark ? 'rgba(5, 22, 35, 0.72)' : 'rgba(255, 255, 255, 0.78)', borderWidth: 1,
    borderColor: isDark ? 'rgba(132, 234, 186, 0.34)' : 'rgba(23, 133, 88, 0.24)', marginTop: 4,
  },
  pegDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: isDark ? '#73E9A5' : '#0C8A58' },
  coinPeg: { color: isDark ? '#D5F7E1' : '#113F2B', fontSize: isSmallMobile ? 11 : 12, fontWeight: '800', letterSpacing: 0.15 },
  textColumn: {
    width: isMobile ? '100%' : undefined, ...(isMobile ? { flexGrow: 0, flexShrink: 1 } : { flexGrow: 1.1, flexShrink: 1, flexBasis: 0 }), minWidth: 0, maxWidth: isMobile ? 520 : 600,
    gap: isMobile ? 14 : 18, alignItems: isMobile ? 'center' : 'flex-start',
  },
  badge: { width: '100%', color: isDark ? '#9BEABB' : '#0B7147', fontSize: 12, fontWeight: '900', letterSpacing: 1.55, textTransform: 'uppercase', textAlign: isMobile ? 'center' : 'left' },
  title: { width: '100%', color: isDark ? '#F5FFFA' : '#10271C', fontSize: isSmallMobile ? 29 : isMobile ? 35 : isTablet ? 42 : 52, fontWeight: '900', lineHeight: isSmallMobile ? 35 : isMobile ? 42 : isTablet ? 50 : 60, letterSpacing: -1.2, textAlign: isMobile ? 'center' : 'left' },
  titleHighlight: { color: isDark ? '#97F5BC' : '#087A4A' },
  titleGreen: { color: isDark ? '#64E89B' : '#0A9356' },
  subtitle: { width: '100%', color: isDark ? '#C1D3CA' : '#40564A', fontSize: isSmallMobile ? 15 : isMobile ? 16 : 18, lineHeight: isSmallMobile ? 22 : isMobile ? 24 : 28, textAlign: isMobile ? 'center' : 'left' },
  actionStack: { width: '100%', gap: 12, marginTop: 4 },
  buttonRow: { width: '100%', flexDirection: isMobile ? 'column' : 'row', gap: 12 },
  heroButton: { flex: isMobile ? 0 : 1, minHeight: 54, alignSelf: 'stretch' },
  rewardPanel: { width: '100%', minHeight: 70, borderRadius: 16, padding: 13, backgroundColor: isDark ? 'rgba(5, 27, 38, 0.76)' : 'rgba(255, 255, 255, 0.74)', borderWidth: 1, borderColor: isDark ? 'rgba(115, 233, 165, 0.28)' : 'rgba(18, 132, 85, 0.24)', overflow: 'visible' },
  rewardPanelClaimed: { borderColor: '#D9A72A', backgroundColor: isDark ? 'rgba(63, 43, 7, 0.34)' : 'rgba(255, 249, 224, 0.82)' },
  rewardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative' },
  rewardOverline: { color: isDark ? '#A8C7B3' : '#527261', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  rewardPillText: { color: isDark ? '#F0FFF5' : '#0E422A', fontSize: 16, fontWeight: '900', marginTop: 1 },
  rewardOrb: { width: 30, height: 30, borderRadius: 999, backgroundColor: isDark ? '#1A7650' : '#CBF7D8', borderWidth: 1, borderColor: isDark ? '#6EEAA4' : '#29975B', alignItems: 'center', justifyContent: 'center' },
  rewardOrbClaimed: { backgroundColor: '#FFF0B3', borderColor: '#D9A72A' },
  rewardOrbCore: { width: 11, height: 11, borderRadius: 999, backgroundColor: '#75EEA4' },
  rewardOrbCoreClaimed: { backgroundColor: '#D9A72A' },
  rewardFloat: { position: 'absolute', right: 28, top: -7, color: isDark ? '#B9FFD2' : '#087A4A', fontSize: 21, fontWeight: '900' },
  rewardSegments: { flexDirection: 'row', gap: 4, marginTop: 10 },
  rewardSegment: { flex: 1, minWidth: 3, height: 5, borderRadius: 999, backgroundColor: isDark ? '#315044' : '#CEE1D5' },
  rewardSegmentFilled: { backgroundColor: '#39CD70' },
  rewardSegmentClaimed: { backgroundColor: '#D9A72A' },
  badgesContainer: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: isMobile ? 'center' : 'flex-start' },
  badgeItem: { minHeight: 30, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: isDark ? 'rgba(17, 42, 54, 0.68)' : 'rgba(255, 255, 255, 0.7)', borderWidth: 1, borderColor: isDark ? '#294859' : '#D2E2D8' },
  badgeText: { color: isDark ? '#C9DAD1' : '#385545', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
