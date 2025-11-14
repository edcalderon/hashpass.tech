import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
} from 'react-native-reanimated';
import Svg, { Circle, Path, Line } from 'react-native-svg';

export function OmniChainSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    // Pulse animation for network icons
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const styles = getStyles(isDark, colors, isMobile);

  const networks = [
    { name: 'Ethereum', icon: 'Ξ', color: '#627EEA' },
    { name: 'Polygon', icon: '⬟', color: '#8247E5' },
    { name: 'Solana', icon: '◎', color: '#14F195' },
    { name: 'Base', icon: '⬬', color: '#0052FF' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('omnichain.title')}</Text>
      
      <View style={styles.visualizationContainer}>
        {/* Network Icons */}
        <View style={styles.networksContainer}>
          {networks.map((network, index) => {
            const angle = (index * 2 * Math.PI) / networks.length;
            const radius = isMobile ? 100 : 150;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            return (
              <Animated.View
                key={network.name}
                style={[
                  styles.networkIcon,
                  {
                    transform: [
                      { translateX: x },
                      { translateY: y },
                    ],
                  },
                  pulseStyle,
                ]}
              >
                <View style={[styles.networkCircle, { borderColor: network.color }]}>
                  <Text style={[styles.networkIconText, { color: network.color }]}>
                    {network.icon}
                  </Text>
                </View>
                <Text style={styles.networkName}>{network.name}</Text>
              </Animated.View>
            );
          })}
        </View>

        {/* Central Vault */}
        <View style={styles.vaultContainer}>
          <View style={styles.vault}>
            <Text style={styles.vaultIcon}>🔐</Text>
            <Text style={styles.vaultLabel}>{t('omnichain.vaultLabel')}</Text>
          </View>
        </View>

        {/* Connecting Lines */}
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
        >
          {networks.map((network, index) => {
            const angle = (index * 2 * Math.PI) / networks.length;
            const radius = isMobile ? 100 : 150;
            const centerX = isMobile ? 150 : 200;
            const centerY = isMobile ? 150 : 200;
            const startX = centerX;
            const startY = centerY;
            const endX = centerX + Math.cos(angle) * radius;
            const endY = centerY + Math.sin(angle) * radius;

            return (
              <Line
                key={`line-${index}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={network.color}
                strokeWidth="2"
                strokeDasharray="5,5"
                opacity={0.4}
              />
            );
          })}
        </Svg>
      </View>

      {/* Features */}
      <View style={styles.featuresContainer}>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>🌐</Text>
          <Text style={styles.featureText}>{t('omnichain.feature1')}</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>🔍</Text>
          <Text style={styles.featureText}>{t('omnichain.feature2')}</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>📊</Text>
          <Text style={styles.featureText}>{t('omnichain.feature3')}</Text>
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
  visualizationContainer: {
    height: isMobile ? 300 : 400,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isMobile ? 40 : 60,
  },
  networksContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkIcon: {
    position: 'absolute',
    alignItems: 'center',
    gap: 8,
  },
  networkCircle: {
    width: isMobile ? 60 : 80,
    height: isMobile ? 60 : 80,
    borderRadius: 999,
    borderWidth: 3,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  networkIconText: {
    fontSize: isMobile ? 24 : 32,
    fontWeight: '800',
  },
  networkName: {
    fontSize: isMobile ? 12 : 14,
    fontWeight: '600',
    color: isDark ? '#9CA3AF' : '#6B7280',
    marginTop: 4,
  },
  vaultContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vault: {
    width: isMobile ? 120 : 160,
    height: isMobile ? 120 : 160,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
    borderWidth: 3,
    borderColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#22C55E',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  vaultIcon: {
    fontSize: isMobile ? 48 : 64,
  },
  vaultLabel: {
    fontSize: isMobile ? 14 : 18,
    fontWeight: '700',
    color: '#22C55E',
    textAlign: 'center',
  },
  featuresContainer: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: 20,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    fontSize: isMobile ? 14 : 16,
    fontWeight: '600',
    color: isDark ? '#E5E7EB' : '#1F2937',
  },
});

