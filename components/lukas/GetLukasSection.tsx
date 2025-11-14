import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

export function GetLukasSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const [isConnecting, setIsConnecting] = useState(false);
  
  const buttonScale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleConnectWallet = () => {
    // TODO: Integrate with WalletConnect / RainbowKit / etc.
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnecting(false);
      // Show coming soon message
      alert(t('getLukas.comingSoonDesc'));
    }, 1000);
  };

  const handleJoinWaitlist = () => {
    Linking.openURL('https://hashpass.tech');
  };

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.95);
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1);
  };

  const styles = getStyles(isDark, colors, isMobile);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('getLukas.title')}</Text>
      
      <View style={styles.content}>
        {/* Steps */}
        <View style={styles.stepsContainer}>
          <View style={styles.step}>
            <View style={styles.stepNumberContainer}>
              <Text style={styles.stepNumber}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('getLukas.step1.title')}</Text>
              <Text style={styles.stepDescription}>
                {t('getLukas.step1.description')}
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumberContainer}>
              <Text style={styles.stepNumber}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('getLukas.step2.title')}</Text>
              <Text style={styles.stepDescription}>
                {t('getLukas.step2.description')}
              </Text>
            </View>
          </View>

          <View style={styles.step}>
            <View style={styles.stepNumberContainer}>
              <Text style={styles.stepNumber}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('getLukas.step3.title')}</Text>
              <Text style={styles.stepDescription}>
                {t('getLukas.step3.description')}
              </Text>
            </View>
          </View>
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaContainer}>
          <Animated.View style={buttonAnimatedStyle}>
            <TouchableOpacity
              onPress={handleConnectWallet}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={[styles.primaryButton, isConnecting && styles.buttonDisabled]}
              disabled={isConnecting}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>
                {isConnecting ? t('getLukas.connecting') : t('getLukas.connectWallet')}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            onPress={handleJoinWaitlist}
            style={styles.secondaryButton}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>{t('getLukas.joinWaitlist')}</Text>
          </TouchableOpacity>
        </View>

        {/* Coming Soon Badge */}
        <View style={styles.comingSoonContainer}>
          <Text style={styles.comingSoonText}>
            {t('getLukas.comingSoon')}
          </Text>
          <Text style={styles.comingSoonSubtext}>
            {t('getLukas.comingSoonDesc')}
          </Text>
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
    gap: 40,
  },
  stepsContainer: {
    gap: 24,
  },
  step: {
    flexDirection: 'row',
    gap: 20,
    padding: 24,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  stepNumberContainer: {
    width: isMobile ? 40 : 48,
    height: isMobile ? 40 : 48,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    color: '#022C22',
    fontSize: isMobile ? 18 : 22,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    fontSize: isMobile ? 18 : 22,
    fontWeight: '700',
    color: isDark ? '#F9FAFB' : '#111827',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    lineHeight: isMobile ? 20 : 24,
  },
  ctaContainer: {
    gap: 16,
    alignItems: 'center',
  },
  primaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: isMobile ? '100%' : 300,
    shadowColor: '#22C55E',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#022C22',
    fontSize: isMobile ? 16 : 18,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: isDark ? '#4B5563' : '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: isMobile ? '100%' : 300,
  },
  secondaryButtonText: {
    color: isDark ? '#E5E7EB' : '#1F2937',
    fontSize: isMobile ? 16 : 18,
    fontWeight: '600',
  },
  comingSoonContainer: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.05)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)',
    alignItems: 'center',
    gap: 8,
  },
  comingSoonText: {
    fontSize: isMobile ? 16 : 18,
    fontWeight: '700',
    color: isDark ? '#FBBF24' : '#D97706',
    textAlign: 'center',
  },
  comingSoonSubtext: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
    lineHeight: isMobile ? 20 : 24,
  },
});

