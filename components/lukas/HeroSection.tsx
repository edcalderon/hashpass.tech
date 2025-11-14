import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { LukasCoin } from './LukasCoin';

interface HeroSectionProps {
  onGetLukas: () => void;
  onForMerchants: () => void;
}

export function HeroSection({ onGetLukas, onForMerchants }: HeroSectionProps) {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const [screenWidth, setScreenWidth] = useState(
    Platform.OS === 'web' && typeof window !== 'undefined' 
      ? window.innerWidth 
      : Dimensions.get('window').width
  );

  // Responsive breakpoints
  const isSmallMobile = screenWidth < 375;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;
  
  // Coin animation values
  const coinTranslateY = useSharedValue(0);
  const coinRotate = useSharedValue(0);
  const coinScale = useSharedValue(1);

  useEffect(() => {
    const updateDimensions = () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        setScreenWidth(window.innerWidth);
      } else {
        setScreenWidth(Dimensions.get('window').width);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    } else {
      const subscription = Dimensions.addEventListener('change', ({ window }) => {
        setScreenWidth(window.width);
      });
      return () => subscription?.remove();
    }
  }, []);

  useEffect(() => {
    // Floating animation
    coinTranslateY.value = withRepeat(
      withSequence(
        withTiming(-15, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(15, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Slow rotation
    coinRotate.value = withRepeat(
      withTiming(360, { duration: 10000, easing: Easing.linear }),
      -1,
      false
    );

    // Subtle scale pulse
    coinScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const coinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: coinTranslateY.value },
      { rotate: `${coinRotate.value}deg` },
      { scale: coinScale.value },
    ],
  }));

  const styles = getStyles(isDark, colors, isMobile, isSmallMobile, isTablet, isDesktop, screenWidth);

  // Calculate coin size based on screen width
  const coinSize = isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220;

  return (
    <LinearGradient
      colors={isDark 
        ? ['#022C22', '#064E3B', '#065F46', '#047857']
        : ['#ECFDF5', '#D1FAE5', '#A7F3D0', '#6EE7B7']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Left side - Animated Coin */}
        <View style={styles.coinContainer}>
          <Animated.View style={[styles.coin, coinAnimatedStyle]}>
            <LukasCoin size={coinSize} />
            {/* Glow effect */}
            <View style={styles.coinGlow} />
          </Animated.View>
          <Text style={styles.coinPeg} numberOfLines={1} adjustsFontSizeToFit>
            {t('hero.peg')}
          </Text>
        </View>

        {/* Right side - Text + CTAs */}
        <View style={styles.textContainer}>
          <Text style={styles.badge} numberOfLines={1}>
            {t('hero.badge')}
          </Text>
          
          <Text style={styles.title} numberOfLines={3} adjustsFontSizeToFit>
            {t('hero.title')} <Text style={styles.titleHighlight}>{t('hero.titleHighlight')}</Text>
            {'\n'}
            {t('hero.titleSuffix')} <Text style={styles.titleGreen}>{t('hero.titleGreen')}</Text>.
          </Text>

          <Text style={styles.subtitle} numberOfLines={4}>
            {t('hero.subtitle')}
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              onPress={onGetLukas}
              style={styles.primaryButton}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText} numberOfLines={1}>
                {t('hero.getLukas')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onForMerchants}
              style={styles.secondaryButton}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText} numberOfLines={1}>
                {t('hero.forMerchants')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Micro badges */}
          <View style={styles.badgesContainer}>
            {[
              t('hero.badges.peg'),
              t('hero.badges.merchants'),
              t('hero.badges.collateral'),
            ].map((badge, index) => (
              <View key={`${badge}-${index}`} style={styles.badgeItem}>
                <Text style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit>
                  {badge}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </LinearGradient>
  );
}

const getStyles = (
  isDark: boolean, 
  colors: any, 
  isMobile: boolean, 
  isSmallMobile: boolean,
  isTablet: boolean,
  isDesktop: boolean,
  screenWidth: number
) => StyleSheet.create({
  container: {
    minHeight: isSmallMobile ? 500 : isMobile ? 600 : isTablet ? 700 : 800,
    width: '100%',
    paddingVertical: isSmallMobile ? 40 : isMobile ? 60 : isTablet ? 80 : 100,
    paddingHorizontal: isSmallMobile ? 16 : isMobile ? 20 : isTablet ? 32 : 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 1200,
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: isSmallMobile ? 24 : isMobile ? 32 : isTablet ? 48 : 60,
    flexWrap: 'wrap',
  },
  coinContainer: {
    flex: isMobile ? 0 : 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220,
    maxWidth: isMobile ? '100%' : 300,
  },
  coin: {
    width: isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220,
    height: isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinPeg: {
    color: isDark ? '#A7F3D0' : '#022C22',
    fontSize: isSmallMobile ? 10 : isMobile ? 12 : 14,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: '100%',
  },
  coinGlow: {
    position: 'absolute',
    width: '140%',
    height: '140%',
    borderRadius: 999,
    backgroundColor: '#10B981',
    opacity: 0.3,
    top: '-20%',
    left: '-20%',
    zIndex: -1,
  },
  textContainer: {
    flex: isMobile ? 0 : 1,
    gap: isSmallMobile ? 12 : isMobile ? 14 : 16,
    maxWidth: isMobile ? '100%' : isTablet ? 500 : 600,
    minWidth: isMobile ? '100%' : 280,
    flexShrink: 1,
  },
  badge: {
    color: isDark ? '#9CA3AF' : '#6B7280',
    fontSize: isSmallMobile ? 10 : isMobile ? 11 : isTablet ? 13 : 14,
    textTransform: 'uppercase',
    letterSpacing: isSmallMobile ? 1.2 : 1.8,
    fontWeight: '600',
  },
  title: {
    color: isDark ? '#F9FAFB' : '#111827',
    fontSize: isSmallMobile ? 22 : isMobile ? 28 : isTablet ? 36 : 48,
    fontWeight: '800',
    lineHeight: isSmallMobile ? 28 : isMobile ? 36 : isTablet ? 44 : 56,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  titleHighlight: {
    color: isDark ? '#22C55E' : '#059669',
  },
  titleGreen: {
    color: '#22C55E',
  },
  subtitle: {
    color: isDark ? '#9CA3AF' : '#6B7280',
    fontSize: isSmallMobile ? 14 : isMobile ? 15 : isTablet ? 17 : 18,
    lineHeight: isSmallMobile ? 20 : isMobile ? 22 : isTablet ? 26 : 28,
    marginTop: 4,
    flexShrink: 1,
  },
  buttonContainer: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: isSmallMobile ? 8 : 12,
    marginTop: isSmallMobile ? 8 : 12,
    width: '100%',
    flexWrap: 'wrap',
  },
  primaryButton: {
    paddingHorizontal: isSmallMobile ? 20 : isMobile ? 24 : 28,
    paddingVertical: isSmallMobile ? 12 : 14,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    flex: isMobile ? 1 : 0,
    minWidth: isMobile ? '100%' : 180,
  },
  primaryButtonText: {
    color: '#022C22',
    fontSize: isSmallMobile ? 14 : isMobile ? 15 : isTablet ? 17 : 18,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingHorizontal: isSmallMobile ? 20 : isMobile ? 24 : 28,
    paddingVertical: isSmallMobile ? 12 : 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: isDark ? '#4B5563' : '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    flex: isMobile ? 1 : 0,
    minWidth: isMobile ? '100%' : 180,
  },
  secondaryButtonText: {
    color: isDark ? '#E5E7EB' : '#1F2937',
    fontSize: isSmallMobile ? 14 : isMobile ? 15 : isTablet ? 17 : 18,
    fontWeight: '600',
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: isSmallMobile ? 6 : 8,
    marginTop: isSmallMobile ? 8 : 10,
    width: '100%',
  },
  badgeItem: {
    paddingHorizontal: isSmallMobile ? 10 : 12,
    paddingVertical: isSmallMobile ? 5 : 6,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.8)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 1,
    borderColor: isDark ? '#1F2937' : '#E5E7EB',
    flexShrink: 1,
  },
  badgeText: {
    color: isDark ? '#9CA3AF' : '#6B7280',
    fontSize: isSmallMobile ? 9 : isMobile ? 10 : isTablet ? 11 : 12,
    fontWeight: '500',
  },
});

