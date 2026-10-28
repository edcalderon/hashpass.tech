import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { LukasGlyph } from './LukasGlyph';

export function WhySection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');

  const opacity1 = useSharedValue(0);
  const opacity2 = useSharedValue(0);
  const opacity3 = useSharedValue(0);
  const translateY1 = useSharedValue(30);
  const translateY2 = useSharedValue(30);
  const translateY3 = useSharedValue(30);

  useEffect(() => {
    // Staggered animation on mount
    opacity1.value = withTiming(1, { duration: 600 });
    translateY1.value = withTiming(0, { duration: 600 });

    opacity2.value = withDelay(200, withTiming(1, { duration: 600 }));
    translateY2.value = withDelay(200, withTiming(0, { duration: 600 }));

    opacity3.value = withDelay(400, withTiming(1, { duration: 600 }));
    translateY3.value = withDelay(400, withTiming(0, { duration: 600 }));
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({
    opacity: opacity1.value,
    transform: [{ translateY: translateY1.value }],
  }));

  const animatedStyle2 = useAnimatedStyle(() => ({
    opacity: opacity2.value,
    transform: [{ translateY: translateY2.value }],
  }));

  const animatedStyle3 = useAnimatedStyle(() => ({
    opacity: opacity3.value,
    transform: [{ translateY: translateY3.value }],
  }));

  const styles = getStyles(isDark, colors, isMobile);

  const bullets = [
    {
      title: t('why.bullet1.title'),
      description: t('why.bullet1.description'),
      glyph: 'coffee' as const,
    },
    {
      title: t('why.bullet2.title'),
      description: t('why.bullet2.description'),
      glyph: 'market' as const,
    },
    {
      title: t('why.bullet3.title'),
      description: t('why.bullet3.description'),
      glyph: 'shield' as const,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('why.title')}</Text>

      <View style={styles.content}>
        <View style={styles.illustrationContainer}>
          <View style={styles.illustration}>
            <LukasGlyph name="token" size={isMobile ? 112 : 146} />
            <Text style={styles.illustrationText}>LUKAS</Text>
          </View>
        </View>

        <View style={styles.bulletsContainer}>
          <Animated.View style={[styles.bullet, animatedStyle1]}>
            <LukasGlyph name={bullets[0].glyph} size={isMobile ? 46 : 54} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>{bullets[0].title}</Text>
              <Text style={styles.bulletDescription}>{bullets[0].description}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.bullet, animatedStyle2]}>
            <LukasGlyph name={bullets[1].glyph} size={isMobile ? 46 : 54} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>{bullets[1].title}</Text>
              <Text style={styles.bulletDescription}>{bullets[1].description}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.bullet, animatedStyle3]}>
            <LukasGlyph name={bullets[2].glyph} size={isMobile ? 46 : 54} />
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>{bullets[2].title}</Text>
              <Text style={styles.bulletDescription}>{bullets[2].description}</Text>
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  title: {
    fontSize: isMobile ? 32 : 48,
    fontWeight: '900',
    color: isDark ? '#F5FFFA' : '#10271C',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
    letterSpacing: -0.5,
  },
  content: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: 0,
    alignItems: isMobile ? 'stretch' : 'center',
    width: '100%',
  },
  illustrationContainer: {
    flex: isMobile ? 0 : 1,
    width: isMobile ? '100%' : undefined,
    minHeight: isMobile ? 220 : undefined,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isMobile ? 28 : 0,
  },
  illustration: {
    width: isMobile ? '100%' : 320,
    maxWidth: isMobile ? 320 : undefined,
    height: isMobile ? 236 : 320,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(10, 39, 51, 0.9)' : '#F0F8F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(120, 234, 173, 0.28)' : '#CCE5D5',
    gap: 12,
    shadowColor: '#061523',
    shadowOpacity: isDark ? 0.28 : 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  illustrationText: {
    fontSize: isMobile ? 24 : 32,
    fontWeight: '800',
    color: isDark ? '#9BEABB' : '#087A4A',
    letterSpacing: 1.4,
  },
  bulletsContainer: {
    flex: isMobile ? 0 : 1,
    width: isMobile ? '100%' : undefined,
    gap: 16,
    marginTop: isMobile ? 0 : undefined,
  },
  bullet: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: isMobile ? 16 : 20,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(7, 28, 42, 0.72)' : 'rgba(247, 252, 249, 0.92)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(139, 224, 176, 0.2)' : '#D7EADF',
  },
  bulletContent: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  bulletTitle: {
    fontSize: isMobile ? 18 : 22,
    fontWeight: '700',
    color: isDark ? '#F5FFFA' : '#10271C',
    marginBottom: 4,
  },
  bulletDescription: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#BED2C6' : '#425D4D',
    lineHeight: isMobile ? 20 : 24,
  },
});
