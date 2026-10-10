import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Dimensions, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import { LinearGradient } from 'expo-linear-gradient';
import { LukasCoin } from './LukasCoin';

interface HeroSectionProps {
  onGetLukas: () => void;
  onForMerchants: () => void;
}

const PEG_CURRENCIES = ['COP', 'ARS', 'BRL', 'MXN', 'CLP'];

export function HeroSection({ onGetLukas, onForMerchants }: HeroSectionProps) {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const [pegCurrencyIndex, setPegCurrencyIndex] = useState(0);
  const [screenWidth, setScreenWidth] = useState(
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.innerWidth
      : Dimensions.get('window').width
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setPegCurrencyIndex((current) => (current + 1) % PEG_CURRENCIES.length);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  // Responsive breakpoints
  const isSmallMobile = screenWidth < 375;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;

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

  const styles = getStyles(isDark, colors, isMobile, isSmallMobile, isTablet, isDesktop, screenWidth);

  // Calculate coin size based on screen width
  const coinSize = isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220;

  return (
    <LinearGradient
      colors={isDark
        ? ['#0B1223', '#101D32', '#112C39', '#17243B']
        : ['#F0F5FA', '#E7EFF7', '#DDEDF2', '#E9EAF7']
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Left side - Animated Coin */}
        <View style={styles.coinContainer}>
          <View style={{ width: coinSize * 1.6, height: coinSize * 1.6, overflow: 'hidden' }}>
            <LukasCoin size={coinSize} />
          </View>
          <Text style={styles.coinPeg} numberOfLines={1} adjustsFontSizeToFit>
            1 LUKAS = 1 {PEG_CURRENCIES[pegCurrencyIndex]}
          </Text>
        </View>

        {/* Right side - Text + CTAs */}
        <View style={styles.textContainer}>
          <Text style={styles.badge} numberOfLines={1}>
            {t('hero.badge')}
          </Text>

          <Text style={styles.title} numberOfLines={3} adjustsFontSizeToFit>
            The region's <Text style={styles.titleHighlight}>stable index peso</Text>
            {'\n'}
            with real <Text style={styles.titleGreen}>meme coin soul</Text>.
          </Text>

          <Text style={styles.subtitle} numberOfLines={4}>
            $LUKAS tracks the LatAm peso index: 1 LUKAS = 1 Peso LatAm (basket of BRL, MXN, COP, CLP, ARS), backed by HashPass merchants and omni-chain crypto collateral. Built for real payments across Latin America.
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
              `Peg 1:1 ${PEG_CURRENCIES[pegCurrencyIndex]}`,
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
    paddingVertical: isSmallMobile ? 32 : isMobile ? 48 : isTablet ? 80 : 100,
    paddingHorizontal: isSmallMobile ? 16 : isMobile ? 20 : isTablet ? 32 : 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  content: {
    width: '100%',
    maxWidth: 1200,
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: isMobile ? 'center' : 'space-between',
    gap: isSmallMobile ? 20 : isMobile ? 24 : isTablet ? 48 : 60,
    flexWrap: 'wrap',
  },
  coinContainer: {
    flex: isMobile ? 0 : 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: isMobile ? '100%' : 'auto',
    minWidth: isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220,
    maxWidth: isMobile ? '100%' : 420,
    paddingHorizontal: isMobile ? 0 : 0,
  },
  coin: {
    width: isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220,
    height: isSmallMobile ? 140 : isMobile ? 160 : isTablet ? 200 : 220,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  coinPeg: {
    color: isDark ? '#A7F3D0' : '#022C22',
    fontSize: isSmallMobile ? 10 : isMobile ? 12 : 14,
    fontWeight: '700',
    marginTop: 18,
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
    width: isMobile ? '100%' : 'auto',
    alignItems: isMobile ? 'center' : 'flex-start',
    flexShrink: 1,
    paddingHorizontal: isMobile ? 0 : 0,
  },
  badge: {
    color: isDark ? '#9CA3AF' : '#6B7280',
    fontSize: isSmallMobile ? 10 : isMobile ? 11 : isTablet ? 13 : 14,
    textTransform: 'uppercase',
    letterSpacing: isSmallMobile ? 1.2 : 1.8,
    fontWeight: '600',
    textAlign: isMobile ? 'center' : 'left',
    width: '100%',
  },
  title: {
    color: isDark ? '#F9FAFB' : '#111827',
    fontSize: isSmallMobile ? 22 : isMobile ? 28 : isTablet ? 36 : 48,
    fontWeight: '800',
    lineHeight: isSmallMobile ? 28 : isMobile ? 36 : isTablet ? 44 : 56,
    letterSpacing: -0.5,
    flexShrink: 1,
    textAlign: isMobile ? 'center' : 'left',
    width: '100%',
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
    textAlign: isMobile ? 'center' : 'left',
    width: '100%',
  },
  buttonContainer: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: isSmallMobile ? 8 : 12,
    marginTop: isSmallMobile ? 8 : 12,
    width: '100%',
    flexWrap: 'wrap',
    alignItems: isMobile ? 'stretch' : 'flex-start',
    justifyContent: isMobile ? 'center' : 'flex-start',
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
    justifyContent: isMobile ? 'center' : 'flex-start',
    alignItems: 'center',
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
