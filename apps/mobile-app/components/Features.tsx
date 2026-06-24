import React, { useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Dimensions, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/i18n';
import { useRouter } from 'expo-router';
import { GlowingEffect } from './GlowingEffect';
import FlipCard from './FlipCard';
import FeatureFlipCard from './FeatureFlipCard';
import { Ionicons } from '../lib/vector-icons';

const CARD_SIZE = Math.min(280, Dimensions.get('window').width - 64);

const getFeatureStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  feature: {
    marginBottom: 24,
    padding: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.45 : 0.08,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    alignItems: 'center',
    backgroundColor: isDark ? '#07070a' : '#f8fafc',
    width: CARD_SIZE + 40,
  },
  cardInner: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  iconContainerSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  featureTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
    textAlign: 'center',
    color: isDark ? '#ffffff' : '#09090b',
  },
  featureTitleSmall: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: isDark ? '#ffffff' : '#09090b',
  },
  featureHint: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: isDark ? '#71717a' : '#a1a1aa',
  },
  featureDescription: {
    fontSize: 15,
    lineHeight: 26,
    textAlign: 'left',
    color: isDark ? '#d4d4d8' : '#3f3f46',
    flexShrink: 1,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    borderColor: 'rgba(6, 182, 212, 0.3)',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#06b6d4',
  },
  webCardItem: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    width: 320,
    maxWidth: '92%' as any,
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
  const router = useRouter();
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
      actionText: 'Secure data now',
      color: '#06b6d4',
    },
    {
      id: 'management',
      icon: 'key',
      title: t('features.management.title'),
      description: t('features.management.description'),
      moreInfo: t('features.management.moreInfo', t('features.management.description')),
      actionText: 'Manage your keys',
      color: '#ef4444',
    },
    {
      id: 'sync',
      icon: 'sync',
      title: t('features.sync.title'),
      description: t('features.sync.description'),
      moreInfo: t('features.sync.moreInfo', t('features.sync.description')),
      actionText: 'Start always sync',
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
                actionText={feature.actionText}
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
            style={[featureStyles.feature, [feature1Style, feature2Style, feature3Style][index]]}
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
            <View style={featureStyles.cardInner}>
              <FlipCard
                isFlipped={flipValues[index]}
                RegularContent={
                  <View style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 16,
                  }}>
                    <View style={[
                      featureStyles.iconContainer,
                      { borderWidth: 1, borderColor: `${feature.color}66`, backgroundColor: `${feature.color}1f` },
                    ]}>
                      <Ionicons name={feature.icon as any} size={32} color={feature.color} />
                    </View>
                    <Text style={featureStyles.featureTitle}>{feature.title}</Text>
                    <Text style={featureStyles.featureHint}>{t('tapToRead', 'Tap to read more')}</Text>
                  </View>
                }
                FlippedContent={
                  <View style={{
                    flex: 1,
                    padding: 20,
                    justifyContent: 'space-between',
                  }}>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <View style={[
                          featureStyles.iconContainerSmall,
                          { borderWidth: 1, borderColor: `${feature.color}66`, backgroundColor: `${feature.color}1f` },
                        ]}>
                          <Ionicons name={feature.icon as any} size={16} color={feature.color} />
                        </View>
                        <Text style={featureStyles.featureTitleSmall}>{feature.title}</Text>
                      </View>
                      <Text style={featureStyles.featureDescription}>{feature.description}</Text>
                    </View>
                    <TouchableOpacity
                      style={[featureStyles.actionButton, { borderColor: `${feature.color}4d`, backgroundColor: `${feature.color}12` }]}
                      onPress={() => router.push('/(shared)/auth' as any)}
                      activeOpacity={0.75}
                    >
                      <Text style={[featureStyles.actionButtonText, { color: feature.color }]}>{feature.actionText}</Text>
                    </TouchableOpacity>
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
