import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

export function MerchantsSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  
  const cardOpacities = [
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
    useSharedValue(0),
  ];
  const cardTranslates = [
    useSharedValue(30),
    useSharedValue(30),
    useSharedValue(30),
    useSharedValue(30),
  ];

  useEffect(() => {
    cardOpacities.forEach((opacity, index) => {
      opacity.value = withDelay(index * 150, withTiming(1, { duration: 600 }));
      cardTranslates[index].value = withDelay(index * 150, withTiming(0, { duration: 600 }));
    });
  }, []);

  const styles = getStyles(isDark, colors, isMobile);

  const merchantCategories = [
    {
      title: t('merchants.category1.title'),
      subtitle: t('merchants.category1.subtitle'),
      icon: '🎪',
      color: '#8B5CF6',
    },
    {
      title: t('merchants.category2.title'),
      subtitle: t('merchants.category2.subtitle'),
      icon: '☕',
      color: '#F59E0B',
    },
    {
      title: t('merchants.category3.title'),
      subtitle: t('merchants.category3.subtitle'),
      icon: '💼',
      color: '#3B82F6',
    },
    {
      title: t('merchants.category4.title'),
      subtitle: t('merchants.category4.subtitle'),
      icon: '🌃',
      color: '#EC4899',
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('merchants.title')}
      </Text>

      <ScrollView
        horizontal={!isMobile}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardsContainer}
        style={styles.scrollView}
      >
        {merchantCategories.map((category, index) => {
          const animatedStyle = useAnimatedStyle(() => ({
            opacity: cardOpacities[index].value,
            transform: [{ translateY: cardTranslates[index].value }],
          }));

          return (
            <Animated.View
              key={index}
              style={[
                styles.card,
                { borderColor: category.color + '40' },
                animatedStyle,
              ]}
            >
              <View style={[styles.cardIconContainer, { backgroundColor: category.color + '20' }]}>
                <Text style={styles.cardIcon}>{category.icon}</Text>
              </View>
              <Text style={styles.cardTitle}>{category.title}</Text>
              <Text style={styles.cardSubtitle}>{category.subtitle}</Text>
            </Animated.View>
          );
        })}
      </ScrollView>
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
    fontSize: isMobile ? 28 : 40,
    fontWeight: '800',
    color: isDark ? '#F9FAFB' : '#111827',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
    letterSpacing: -0.5,
    lineHeight: isMobile ? 36 : 48,
  },
  scrollView: {
    flexGrow: 0,
  },
  cardsContainer: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: 20,
    paddingVertical: 10,
  },
  card: {
    width: isMobile ? '100%' : 250,
    padding: 24,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 2,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  cardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 40,
  },
  cardTitle: {
    fontSize: isMobile ? 20 : 22,
    fontWeight: '700',
    color: isDark ? '#F9FAFB' : '#111827',
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
  },
});

