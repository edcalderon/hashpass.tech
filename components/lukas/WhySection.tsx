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
      emoji: '☕',
    },
    {
      title: t('why.bullet2.title'),
      description: t('why.bullet2.description'),
      emoji: '🏪',
    },
    {
      title: t('why.bullet3.title'),
      description: t('why.bullet3.description'),
      emoji: '🔒',
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('why.title')}</Text>
      
      <View style={styles.content}>
        {/* Left side - Illustration placeholder */}
        <View style={styles.illustrationContainer}>
          <View style={styles.illustration}>
            <Text style={styles.illustrationEmoji}>💰</Text>
            <Text style={styles.illustrationText}>LUKAS</Text>
          </View>
        </View>

        {/* Right side - Bullet points */}
        <View style={styles.bulletsContainer}>
          <Animated.View style={[styles.bullet, animatedStyle1]}>
            <Text style={styles.bulletEmoji}>{bullets[0].emoji}</Text>
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>{bullets[0].title}</Text>
              <Text style={styles.bulletDescription}>{bullets[0].description}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.bullet, animatedStyle2]}>
            <Text style={styles.bulletEmoji}>{bullets[1].emoji}</Text>
            <View style={styles.bulletContent}>
              <Text style={styles.bulletTitle}>{bullets[1].title}</Text>
              <Text style={styles.bulletDescription}>{bullets[1].description}</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.bullet, animatedStyle3]}>
            <Text style={styles.bulletEmoji}>{bullets[2].emoji}</Text>
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
    fontWeight: '800',
    color: isDark ? '#F9FAFB' : '#111827',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
    letterSpacing: -0.5,
  },
  content: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? 40 : 60,
    alignItems: 'center',
  },
  illustrationContainer: {
    flex: isMobile ? 0 : 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: isMobile ? 200 : 300,
    height: isMobile ? 200 : 300,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
  },
  illustrationEmoji: {
    fontSize: isMobile ? 80 : 120,
    marginBottom: 16,
  },
  illustrationText: {
    fontSize: isMobile ? 24 : 32,
    fontWeight: '800',
    color: isDark ? '#22C55E' : '#059669',
  },
  bulletsContainer: {
    flex: isMobile ? 0 : 1,
    gap: 24,
  },
  bullet: {
    flexDirection: 'row',
    gap: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  bulletEmoji: {
    fontSize: isMobile ? 32 : 40,
  },
  bulletContent: {
    flex: 1,
    gap: 8,
  },
  bulletTitle: {
    fontSize: isMobile ? 18 : 22,
    fontWeight: '700',
    color: isDark ? '#F9FAFB' : '#111827',
    marginBottom: 4,
  },
  bulletDescription: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    lineHeight: isMobile ? 20 : 24,
  },
});

