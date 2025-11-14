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
      icon: '🔐',
      title: t('howItWorks.step1.title'),
      description: t('howItWorks.step1.description'),
    },
    {
      number: '2',
      icon: '🪙',
      title: t('howItWorks.step2.title'),
      description: t('howItWorks.step2.description'),
    },
    {
      number: '3',
      icon: '🏪',
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
                  <Text style={styles.stepIcon}>{step.icon}</Text>
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
                        stroke={isDark ? '#22C55E' : '#059669'}
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
  title: {
    fontSize: isMobile ? 32 : 48,
    fontWeight: '800',
    color: isDark ? '#F9FAFB' : '#111827',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
    letterSpacing: -0.5,
  },
  timelineContainer: {
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: isMobile ? 30 : 20,
  },
  step: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 2,
    borderColor: isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
    minHeight: isMobile ? 200 : 280,
    position: 'relative',
  },
  stepIconContainer: {
    width: isMobile ? 60 : 80,
    height: isMobile ? 60 : 80,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepIcon: {
    fontSize: isMobile ? 32 : 40,
  },
  stepNumber: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: isMobile ? 32 : 40,
    height: isMobile ? 32 : 40,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: isDark ? '#050816' : '#FFFFFF',
  },
  stepNumberText: {
    color: '#022C22',
    fontSize: isMobile ? 16 : 20,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: isMobile ? 18 : 22,
    fontWeight: '700',
    color: isDark ? '#F9FAFB' : '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
    lineHeight: isMobile ? 20 : 24,
  },
  connector: {
    width: isMobile ? 0 : 60,
    height: isMobile ? 40 : 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  connectorLine: {
    width: isMobile ? 2 : '100%',
    height: isMobile ? '100%' : 2,
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
  },
  connectorArrow: {
    position: 'absolute',
    ...(isMobile ? { bottom: -12 } : { right: -12 }),
  },
});

