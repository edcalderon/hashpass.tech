import React, { useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/i18n';
import { GlowingEffect } from './GlowingEffect';
import FlipCard from './FlipCard';
import FeatureFlipCard from './FeatureFlipCard';

const getFeatureStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  feature: {
    marginBottom: 30,
    padding: 25,
    borderRadius: 2 * 16,
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.05)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    transform: [{ scale: 1 }],
    alignItems: 'center',
    textAlign: 'center',
    backgroundColor: isDark ? colors.background.paper : colors.background.default,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.3,
    textAlign: 'center',
    width: '100%',
    color: isDark ? colors.primary : colors.secondaryDark,
  },
  featureDescription: {
    fontSize: 16,
    lineHeight: 24,
    opacity: isDark ? 0.85 : 0.9,
    letterSpacing: 0.1,
    textAlign: 'center',
    width: '100%',
    color: isDark ? colors.primaryContrastText : colors.textSecondary,
  },
  webCardItem: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    width: 'min(320px, 92vw)',
  },
});

interface FeaturesProps {
  styles: Record<string, any>;
  featuresAnimatedStyle: Record<string, any>;
  feature1Style: Record<string, any>;
  feature2Style: Record<string, any>;
  feature3Style: Record<string, any>;
  isDark: boolean;
}

const Features: React.FC<FeaturesProps> = ({
  styles: containerStyles = {},
  featuresAnimatedStyle = {},
  feature1Style = {},
  feature2Style = {},
  feature3Style = {},
  isDark = false,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation('index');
  const featureStyles = getFeatureStyles(isDark, colors);
  const flipValues = useRef([
    useSharedValue(false),
    useSharedValue(false),
    useSharedValue(false)
  ]).current;

  const features = [
    {
      id: 'secure',
      icon: 'shield-checkmark',
      title: t('features.secure.title'),
      description: t('features.secure.description'),
      moreInfo: t('features.secure.moreInfo', t('features.secure.description')),
      color: '#06b6d4',
    },
    {
      id: 'management',
      icon: 'key',
      title: t('features.management.title'),
      description: t('features.management.description'),
      moreInfo: t('features.management.moreInfo', t('features.management.description')),
      color: '#ef4444',
    },
    {
      id: 'sync',
      icon: 'sync',
      title: t('features.sync.title'),
      description: t('features.sync.description'),
      moreInfo: t('features.sync.moreInfo', t('features.sync.description')),
      color: '#22c55e',
    }
  ];

  if (Platform.OS === 'web') {
    return (
      <Animated.View style={[containerStyles?.featuresContainer, featuresAnimatedStyle]}>
        <View style={containerStyles?.featuresGrid}>
          {features.map((feature, index) => (
            <Animated.View key={feature.id} style={[featureStyles.webCardItem, [feature1Style, feature2Style, feature3Style][index]]}>
              <FeatureFlipCard
                title={feature.title}
                description={feature.moreInfo}
                icon={feature.icon}
                color={feature.color}
                hintText={t('learnMore', 'Learn More')}
                actionText={t('getStartedNow', 'Start Now')}
                isDark={isDark}
                actionHref="/(shared)/auth"
              />
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[containerStyles?.featuresContainer, featuresAnimatedStyle]}>
      <View style={containerStyles?.featuresGrid}>
        {features.map((feature, index) => (
          <Pressable
            key={feature.id}
            onPress={() => {
              flipValues[index].value = !flipValues[index].value;
            }}
            onHoverIn={() => {
              flipValues[index].value = true;
            }}
            onHoverOut={() => {
              flipValues[index].value = false;
            }}
            style={[featureStyles.feature, [feature1Style, feature2Style, feature3Style][index], { backgroundColor: isDark ? 'black' : colors.background.default }]}
          >
            <GlowingEffect
              spread={40}
              glow={true}
              disabled={false}
              proximity={64}
              inactiveZone={0.01}
              borderWidth={3}
              isDarkMode={isDark}
            />
            <View style={{ width: 280, height: 280 }}>
              <FlipCard
                isFlipped={flipValues[index]}
                RegularContent={
                  <View style={{ 
                    flex: 1, 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    padding: 20,
                  }}>
                    <View style={[featureStyles.iconContainer, { marginBottom: 16 }]}>
                      <Ionicons name={feature.icon as any} size={45} color={colors.primary} />
                    </View>
                    <Text style={[featureStyles.featureTitle, { color: colors.text.primary }]}>{feature.title}</Text>
                    <Text style={[featureStyles.featureDescription, { color: colors.text.secondary, textAlign: 'center' }]}>{t('learnMore', 'Learn More')}</Text>
                  </View>
                }
                FlippedContent={
                  <View style={{ 
                    flex: 1, 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    padding: 20,
                  }}>
                    <Text style={[featureStyles.featureDescription, { color: colors.text.primary, textAlign: 'center' }]}>{feature.description}</Text>
                  </View>
                }
              />
            </View>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
};

export default Features;
