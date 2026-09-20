import { uiTokens } from '@hashpass/ui/tokens';
import React, { useRef } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ScrollView, useWindowDimensions, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useTranslation } from '@/i18n/i18n';
import { useRouter } from 'expo-router';
import { GlowingEffect } from './GlowingEffect';
import FlipCard from './FlipCard';
import FeatureFlipCard from './FeatureFlipCard';
import { Ionicons } from '../lib/vector-icons';

const getFeatureStyles = (isDark: boolean, cardWidth: number) => StyleSheet.create({
  responsiveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexGrow: 1,
    justifyContent: 'center',
    gap: 16,
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  compactGrid: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'center',
  },
  feature: {
    padding: 16,
    borderRadius: uiTokens.radius.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.2 : 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    alignItems: 'center',
    backgroundColor: isDark ? '#07070a' : '#f8fafc',
    width: cardWidth,
  },
  cardInner: {
    width: cardWidth - 32,
    height: 188,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: uiTokens.radius.card,
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  iconContainerSmall: {
    width: 32,
    height: 32,
    borderRadius: uiTokens.radius.media,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.5,
    textAlign: 'center',
    color: isDark ? '#ffffff' : '#09090b',
  },
  featureTitleSmall: {
    flex: 1,
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
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'left',
    color: isDark ? '#d4d4d8' : '#3f3f46',
    flexShrink: 1,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: uiTokens.radius.input,
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
    width: cardWidth,
    flexShrink: 0,
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
  const { width } = useWindowDimensions();
  const { t } = useTranslation('index');
  const router = useRouter();
  const viewportWidth = width > 0 ? width : 320;
  const compactLayout = viewportWidth < 700;
  const availableWidth = Math.min(viewportWidth, 960);
  const cardWidth = compactLayout
    ? Math.max(0, Math.min(420, viewportWidth - 48))
    : Math.max(220, Math.min(280, (availableWidth - 64) / 3));
  const featureStyles = getFeatureStyles(isDark, cardWidth);
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
      actionText: t('features.secure.action', 'Secure my data'),
      color: '#06b6d4',
    },
    {
      id: 'management',
      icon: 'key',
      title: t('features.management.title'),
      description: t('features.management.description'),
      moreInfo: t('features.management.moreInfo', t('features.management.description')),
      actionText: t('features.management.action', 'Manage my keys'),
      color: '#ef4444',
    },
    {
      id: 'sync',
      icon: 'sync',
      title: t('features.sync.title'),
      description: t('features.sync.description'),
      moreInfo: t('features.sync.moreInfo', t('features.sync.description')),
      actionText: t('features.sync.action', 'Enable secure sync'),
      color: '#22c55e',
    }
  ];

  if (Platform.OS === 'web') {
    return (
      <Animated.View style={[containerStyles?.featuresContainer, featuresAnimatedStyle]}>
        <View nativeID="landing-feature-grid" style={[containerStyles?.featuresGrid, featureStyles.responsiveGrid, compactLayout && featureStyles.compactGrid]}>
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
      <View nativeID="landing-feature-grid" style={[containerStyles?.featuresGrid, featureStyles.responsiveGrid, compactLayout && featureStyles.compactGrid]}>
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
                    padding: 8,
                  }}>
                    <View style={[
                      featureStyles.iconContainer,
                      { borderWidth: 1, borderColor: `${feature.color}66`, backgroundColor: `${feature.color}1f` },
                    ]}>
                      <Ionicons name={feature.icon as any} size={22} color={feature.color} />
                    </View>
                    <Text style={featureStyles.featureTitle}>{feature.title}</Text>
                    <Text style={featureStyles.featureHint}>{t('tapToRead', 'Tap to read more')}</Text>
                  </View>
                }
                FlippedContent={
                  <View style={{
                    flex: 1,
                    padding: 0,
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
                      <ScrollView style={{ maxHeight: 88 }} nestedScrollEnabled>
                        <Text style={featureStyles.featureDescription}>{feature.description}</Text>
                      </ScrollView>
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
