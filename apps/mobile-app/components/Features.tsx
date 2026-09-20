import { uiTokens } from '@hashpass/ui/tokens';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Pressable, useWindowDimensions, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useTranslation } from '@/i18n/i18n';
import { useRouter } from 'expo-router';
import { GlowingEffect } from './GlowingEffect';
import FlipCard from './FlipCard';
import FeatureFlipCard from './FeatureFlipCard';
import LandingBadge from './LandingBadge';
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

export type SystemMetrics = {
  passes: number;
  agenda: number;
  speakers: number;
  bookings: number;
};

// Verified against production /api/status on 2026-09-20. These values render
// immediately and remain visible when the live status request is unavailable.
export const PUBLIC_METRICS_BASELINE: SystemMetrics = {
  passes: 2,
  agenda: 0,
  speakers: 61,
  bookings: 4,
};

const validMetric = (value: unknown, fallback: number) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? Math.floor(numberValue) : fallback;
};

type MetricCheck = {
  accessible?: boolean;
  count?: unknown;
  itemCount?: unknown;
};

export const mergeLiveSystemMetrics = (current: SystemMetrics, checks: unknown): SystemMetrics => {
  if (!checks || typeof checks !== 'object') return current;

  const metrics = checks as Record<string, MetricCheck | undefined>;
  const nextValue = (check: MetricCheck | undefined, key: 'count' | 'itemCount', fallback: number) =>
    check?.accessible === false ? fallback : validMetric(check?.[key], fallback);

  return {
    passes: nextValue(metrics.passes, 'count', current.passes),
    agenda: nextValue(metrics.agenda, 'itemCount', current.agenda),
    speakers: nextValue(metrics.speakers, 'count', current.speakers),
    bookings: nextValue(metrics.bookings, 'count', current.bookings),
  };
};

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
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>(PUBLIC_METRICS_BASELINE);
  useEffect(() => {
    let active = true;

    fetch('/api/status')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || !data?.checks) return;

        setSystemMetrics((current) => mergeLiveSystemMetrics(current, data.checks));
      })
      .catch(() => {
        // Keep the verified baseline (or the last successful live result).
      });

    return () => { active = false; };
  }, []);
  const router = useRouter();
  const viewportWidth = width > 0 ? width : 320;
  const compactLayout = viewportWidth < 700;
  const availableWidth = Math.min(viewportWidth, 960);
  const cardWidth = compactLayout
    ? Math.max(0, Math.min(420, viewportWidth - 48))
    : Math.max(220, Math.min(280, (availableWidth - 64) / 3));
  const featureStyles = getFeatureStyles(isDark, cardWidth);
  const flipValue1 = useSharedValue(false);
  const flipValue2 = useSharedValue(false);
  const flipValue3 = useSharedValue(false);
  const flipValue4 = useSharedValue(false);
  const flipValue5 = useSharedValue(false);
  const flipValues = [flipValue1, flipValue2, flipValue3, flipValue4, flipValue5];
  const carouselRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; scroll: number } | null>(null);

  const features = [
    {
      id: 'secure',
      icon: 'shield-checkmark',
      title: t('features.secure.title'),
      description: t('features.secure.description'),
      moreInfo: t('features.secure.moreInfo', t('features.secure.description')),
      actionText: t('features.secure.action', 'Secure my data'),
      metric: t('features.secure.metric', 'End-to-end encrypted conversations'),
      metricValue: systemMetrics.speakers, metricLabel: t('features.secure.metricLabel', 'verified speakers'),
      color: uiTokens.feature.cyan,
    },
    {
      id: 'management',
      icon: 'key',
      title: t('features.management.title'),
      description: t('features.management.description'),
      moreInfo: t('features.management.moreInfo', t('features.management.description')),
      actionText: t('features.management.action', 'Manage my keys'),
      metric: t('features.management.metric', 'One pass for your event network'),
      metricValue: systemMetrics.passes, metricLabel: t('features.management.metricLabel', 'passes issued'),
      color: uiTokens.feature.red,
    },
    {
      id: 'sync',
      icon: 'sync',
      title: t('features.sync.title'),
      description: t('features.sync.description'),
      moreInfo: t('features.sync.moreInfo', t('features.sync.description')),
      actionText: t('features.sync.action', 'Enable secure sync'),
      metric: t('features.sync.metric', '3 clients: web, Android and iOS'),
      metricValue: 3, metricLabel: t('features.sync.metricLabel', 'supported platforms'),
      color: uiTokens.feature.green,
    },
    {
      id: 'entry',
      icon: 'qr-code-outline',
      title: t('features.entry.title', 'Fast entry'),
      description: t('features.entry.description', 'Use a live QR pass for quick, reliable event access.'),
      moreInfo: t('features.entry.description', 'Use a live QR pass for quick, reliable event access.'),
      actionText: t('learnMore', 'Learn more'),
      metric: t('features.entry.metric', 'Live QR validation'),
      metricValue: systemMetrics.passes, metricLabel: t('features.entry.metricLabel', 'live passes'),
      color: uiTokens.feature.violet,
    },
    {
      id: 'network',
      icon: 'people-outline',
      title: t('features.network.title', 'Private networking'),
      description: t('features.network.description', 'Find attendees, book meetings and keep conversations private.'),
      moreInfo: t('features.network.description', 'Find attendees, book meetings and keep conversations private.'),
      actionText: t('learnMore', 'Learn more'),
      metric: t('features.network.metric', 'Meetings and encrypted chat'),
      metricValue: systemMetrics.bookings, metricLabel: t('features.network.metricLabel', 'meetings booked'),
      color: uiTokens.feature.amber,
    }
  ];

  if (Platform.OS === 'web') {
    return (
      <Animated.View style={[containerStyles?.featuresContainer, featuresAnimatedStyle]}>
        <View style={{ alignItems: 'center', marginBottom: 28 }}><LandingBadge>{t('featuresBadge', 'Key features')}</LandingBadge><Text style={{ color: isDark ? '#fff' : '#18181b', fontSize: 32, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>{t('features.title', 'Everything your event needs')}</Text><Text style={{ color: isDark ? '#a1a1aa' : '#71717a', fontSize: 16, lineHeight: 24, marginTop: 8, textAlign: 'center', maxWidth: 640 }}>{t('features.subtitle', 'One private identity for entry, connections, passes and rewards.')}</Text></View>
        <View nativeID="landing-feature-grid" style={[containerStyles?.featuresGrid, featureStyles.responsiveGrid, compactLayout && featureStyles.compactGrid]}><div ref={carouselRef} className="hashpass-feature-viewport" onWheel={(event) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) { event.preventDefault(); event.currentTarget.scrollLeft += event.deltaY; } }} onPointerDown={(event) => { dragRef.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft }; event.currentTarget.classList.add('is-dragging'); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragRef.current) return; event.currentTarget.scrollLeft = dragRef.current.scroll - (event.clientX - dragRef.current.x); }} onPointerUp={(event) => { dragRef.current = null; event.currentTarget.classList.remove('is-dragging'); event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={(event) => { dragRef.current = null; event.currentTarget.classList.remove('is-dragging'); }}><div className="hashpass-feature-track">{[...features, ...features].map((feature, index) => (
            <Animated.View key={`${feature.id}-${index}`} style={[featureStyles.webCardItem, { width: cardWidth }, [feature1Style, feature2Style, feature3Style][index % 3]]}>
              <FeatureFlipCard
                title={feature.title}
                description={feature.moreInfo}
                icon={feature.icon}
                color={feature.color}
                hintText={t('learnMore', 'Learn More')}
                actionText={feature.actionText}
                isDark={isDark}
                actionHref="/(shared)/auth"
                metric={feature.metric}
                metricValue={feature.metricValue}
                metricLabel={feature.metricLabel}
              />
            </Animated.View>
          ))}</div></div></View>
        <style>{`@keyframes hashpass-feature-marquee{to{transform:translateX(-50%)}}.hashpass-feature-viewport{overflow-x:auto;overflow-y:hidden;width:100%;scrollbar-width:none;cursor:grab;touch-action:pan-x}.hashpass-feature-viewport::-webkit-scrollbar{display:none}.hashpass-feature-viewport.is-dragging{cursor:grabbing}.hashpass-feature-track{display:flex;gap:16px;width:max-content;animation:hashpass-feature-marquee 34s linear infinite}.hashpass-feature-viewport:hover .hashpass-feature-track,.hashpass-feature-viewport.is-dragging .hashpass-feature-track{animation-play-state:paused}`}</style>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[containerStyles?.featuresContainer, featuresAnimatedStyle]}>
      <View style={{ alignItems: 'center', marginBottom: 18 }}><LandingBadge>{t('featuresBadge', 'Key features')}</LandingBadge></View>
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
                      <View style={{ maxHeight: 88 }}>
                        <Text style={[featureStyles.featureDescription, { marginBottom: 6 }]}>
                          <Text style={{ color: feature.color, fontWeight: '800' }}>{feature.metricValue.toLocaleString()}</Text>
                          <Text style={{ fontWeight: '700' }}> {feature.metricLabel}. </Text>
                          {feature.description}
                        </Text>
                      </View>
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
