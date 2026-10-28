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
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { LukasGlyph } from './LukasGlyph';
import { lukasPalette, lukasSectionTitle } from './lukas-ui';

export function HowItWorksSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');

  const step1Scale = useSharedValue(0.9);
  const step2Scale = useSharedValue(0.9);
  const step3Scale = useSharedValue(0.9);
  const step1Opacity = useSharedValue(0);
  const step2Opacity = useSharedValue(0);
  const step3Opacity = useSharedValue(0);
  const lineProgress = useSharedValue(0);

  useEffect(() => {
    // Animate steps in sequence
    step1Scale.value = withTiming(1, { duration: 500 });
    step1Opacity.value = withTiming(1, { duration: 500 });

    step2Scale.value = withDelay(300, withTiming(1, { duration: 500 }));
    step2Opacity.value = withDelay(300, withTiming(1, { duration: 500 }));

    step3Scale.value = withDelay(600, withTiming(1, { duration: 500 }));
    step3Opacity.value = withDelay(600, withTiming(1, { duration: 500 }));

    // Animate connecting line
    lineProgress.value = withDelay(400, withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }));
  }, []);

  const step1Style = useAnimatedStyle(() => ({
    transform: [{ scale: step1Scale.value }],
    opacity: step1Opacity.value,
  }));

  const step2Style = useAnimatedStyle(() => ({
    transform: [{ scale: step2Scale.value }],
    opacity: step2Opacity.value,
  }));

  const step3Style = useAnimatedStyle(() => ({
    transform: [{ scale: step3Scale.value }],
    opacity: step3Opacity.value,
  }));

  const lineStyle = useAnimatedStyle(() => ({
    opacity: lineProgress.value,
  }));

  const styles = getStyles(isDark, colors, isMobile);

  const steps = [
    {
      number: '1',
      glyph: 'shield' as const,
      title: t('howItWorks.step1.title'),
      description: t('howItWorks.step1.description'),
    },
    {
      number: '2',
      glyph: 'token' as const,
      title: t('howItWorks.step2.title'),
      description: t('howItWorks.step2.description'),
    },
    {
      number: '3',
      glyph: 'market' as const,
      title: t('howItWorks.step3.title'),
      description: t('howItWorks.step3.description'),
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('howItWorks.title')}</Text>

      <View style={styles.timelineContainer}>
        {steps.map((step, index) => {
          const animatedStyle = index === 0 ? step1Style : index === 1 ? step2Style : step3Style;

          return (
            <React.Fragment key={index}>
              <Animated.View style={[styles.step, animatedStyle]}>
                <View style={styles.stepIconContainer}>
                  <LukasGlyph name={step.glyph} size={isMobile ? 56 : 72} />
                </View>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{step.number}</Text>
                </View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>
              </Animated.View>

              {index < steps.length - 1 && (
                <Animated.View style={[styles.connector, lineStyle]}>
                  <View style={styles.connectorLine} />
                  <View style={styles.connectorArrow}>
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M9 18l6-6-6-6"
                        stroke={isDark ? '#9BEABB' : '#087A4A'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                </Animated.View>
              )}
            </React.Fragment>
          );
        })}
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
  title: { ...lukasSectionTitle(lukasPalette(isDark), isMobile), marginBottom: isMobile ? 40 : 60 },
  timelineContainer: {
    width: '100%',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'stretch' : 'center',
    justifyContent: 'space-between',
    gap: 0,
  },
  step: {
    // Let mobile cards grow with translated copy instead of forcing a
    // zero-basis flex item to stay at its minimum height.
    flex: isMobile ? undefined : 1,
    width: isMobile ? '100%' : undefined,
    alignItems: 'center',
    padding: 24,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(7, 28, 42, 0.72)' : 'rgba(247, 252, 249, 0.92)',
    borderWidth: 1,
    borderColor: lukasPalette(isDark).border,
    minHeight: isMobile ? 180 : 280,
    position: 'relative',
  },
  stepIconContainer: {
    width: isMobile ? 60 : 80,
    height: isMobile ? 60 : 80,
    borderRadius: 24,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    position: 'absolute',
    top: isMobile ? 12 : -12,
    right: isMobile ? 12 : -12,
    width: isMobile ? 32 : 40,
    height: isMobile ? 32 : 40,
    borderRadius: 999,
    backgroundColor: lukasPalette(isDark).fill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: isDark ? '#050816' : '#FFFFFF',
  },
  stepNumberText: {
    color: lukasPalette(isDark).onFill,
    fontSize: isMobile ? 16 : 20,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: isMobile ? 18 : 22,
    fontWeight: '700',
    color: isDark ? '#F5FFFA' : '#10271C',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#BED2C6' : '#425D4D',
    textAlign: 'center',
    lineHeight: isMobile ? 20 : 24,
  },
  connector: {
    width: isMobile ? '100%' : 60,
    height: isMobile ? 32 : 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  connectorLine: {
    width: isMobile ? 2 : '100%',
    height: isMobile ? '100%' : 2,
    backgroundColor: isDark ? 'rgba(139, 224, 176, 0.3)' : '#BDE5CA',
  },
  connectorArrow: {
    position: 'absolute',
    ...(isMobile
      ? { bottom: 2, transform: [{ rotate: '90deg' }] }
      : { right: -12 }),
  },
});
