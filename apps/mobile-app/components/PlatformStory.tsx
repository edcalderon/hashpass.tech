import LandingBadge from './LandingBadge';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PlatformStoryCards from './PlatformStoryCards';
import { platformStoryCards } from './platformStoryCards';
import { useTranslation } from '../i18n/i18n';
import { useTheme } from '../hooks/useTheme';

const PlatformStory: React.FC = () => {
  const { t } = useTranslation('index.platformStory');
  const { colors } = useTheme();
  const stories = platformStoryCards.map((card) => ({
    ...card,
    metricValue: t(`cards.${card.id}.metricValue`),
    metric: t(`cards.${card.id}.metric`),
    eyebrow: t(`cards.${card.id}.eyebrow`),
    title: t(`cards.${card.id}.title`),
    description: t(`cards.${card.id}.description`),
  }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}><LandingBadge>{t('eyebrow')}</LandingBadge></View>
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {t('title')}
        </Text>
        <Text style={[styles.description, { color: colors.text.secondary }]}>
          {t('description')}
        </Text>
      </View>
      <PlatformStoryCards stories={stories} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 48, paddingHorizontal: 16 },
  header: { alignItems: 'center', marginBottom: 32 },
  badge: { marginBottom: 16 },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    maxWidth: 560,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    opacity: 0.82,
  },
});

export default PlatformStory;
