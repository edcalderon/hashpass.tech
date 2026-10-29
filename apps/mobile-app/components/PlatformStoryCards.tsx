import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Text, View, StyleSheet } from 'react-native';
import { Surface } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import FeatureIcon from './FeatureIcon';
import PlatformStoryMetricValue from './PlatformStoryMetricValue';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import { useTheme } from '../hooks/useTheme';
import type { PlatformStoryCard } from './types/PlatformStory.types';

const PlatformStoryCards = ({ stories }: { stories: PlatformStoryCard[] }) => {
  const { colors, isDark } = useTheme();
  const { animationLevel } = useAnimationLevel();
  const [systemReduced, setSystemReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted && !preferenceChanged) setSystemReduced(value);
    }).catch(() => {});
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      preferenceChanged = true;
      setSystemReduced(value);
    });
    const app = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => {
      mounted = false;
      preference.remove();
      app.remove();
    };
  }, []);

  const shouldAnimate = animationLevel === 'full' && !systemReduced && foreground;

  return (
    <View style={styles.grid}>
      {stories.map((story, index) => (
        <Surface
          key={story.id}
          mode={isDark ? 'dark' : 'light'}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <Text selectable={false} style={[styles.eyebrow, { color: colors.text.secondary }]}>
              {story.eyebrow}
            </Text>
          </View>
          <View>
            <Text selectable={false} style={[styles.title, { color: colors.text.primary }]}>
              {story.title}
            </Text>
            <Text selectable={false} style={[styles.description, { color: colors.text.secondary }]}>
              {story.description}
            </Text>
          </View>
          <View style={styles.metricRow}>
            <FeatureIcon
              name={story.icon}
              color={story.accentColor}
              compact
              active={shouldAnimate}
              entranceDelay={Math.min(index, 3) * uiTokens.motion.stagger}
            />
            <View style={styles.metricCopy}>
              <PlatformStoryMetricValue
                value={story.metricValue}
                animate={shouldAnimate}
                delay={Math.min(index, 3) * uiTokens.motion.stagger}
                style={[styles.metricValue, { color: colors.text.primary }]}
              />
              <Text selectable={false} style={[styles.metric, { color: colors.text.secondary }]}>
                {story.metric}
              </Text>
            </View>
          </View>
        </Surface>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: { gap: uiTokens.space.lg },
  card: {
    justifyContent: 'space-between',
    gap: uiTokens.space.xl,
    padding: uiTokens.space.lg,
  },
  cardTop: { marginBottom: uiTokens.space.xl },
  eyebrow: {
    flexShrink: 1,
    fontSize: uiTokens.type.caption,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 1.1,
    paddingTop: uiTokens.space.xs,
  },
  title: {
    fontSize: uiTokens.type.title,
    lineHeight: 30,
    fontWeight: '700',
    marginBottom: uiTokens.space.sm,
  },
  description: {
    fontSize: uiTokens.type.body,
    lineHeight: 24,
    opacity: 0.9,
  },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md, marginTop: uiTokens.space.xl },
  metricCopy: { flex: 1 },
  metricValue: { fontSize: uiTokens.type.label, lineHeight: 20, fontWeight: '700' },
  metric: { fontSize: uiTokens.type.caption, lineHeight: 18, opacity: 0.78 },
});

export default PlatformStoryCards;
