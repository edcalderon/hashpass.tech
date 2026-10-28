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
import { LukasGlyph } from './LukasGlyph';

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
      glyph: 'event' as const,
    },
    {
      title: t('merchants.category2.title'),
      subtitle: t('merchants.category2.subtitle'),
      glyph: 'coffee' as const,
    },
    {
      title: t('merchants.category3.title'),
      subtitle: t('merchants.category3.subtitle'),
      glyph: 'wallet' as const,
    },
    {
      title: t('merchants.category4.title'),
      subtitle: t('merchants.category4.subtitle'),
      glyph: 'market' as const,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('merchants.title')}
      </Text>

      <ScrollView
        horizontal={!isMobile}
        scrollEnabled={!isMobile}
        nestedScrollEnabled
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
                animatedStyle,
              ]}
            >
              <View style={styles.cardIconContainer}>
                <LukasGlyph name={category.glyph} size={68} />
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
    fontWeight: '900',
    color: isDark ? '#F5FFFA' : '#10271C',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
    letterSpacing: -0.5,
    lineHeight: isMobile ? 36 : 48,
  },
  scrollView: {
    width: '100%',
    flexGrow: 0,
  },
  cardsContainer: {
    width: '100%',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? 16 : 18,
    paddingVertical: 10,
  },
  card: {
    width: isMobile ? '100%' : 250,
    maxWidth: '100%',
    alignSelf: 'stretch',
    flexShrink: 1,
    marginBottom: 0,
    padding: isMobile ? 20 : 24,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(7, 28, 42, 0.72)' : 'rgba(247, 252, 249, 0.92)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(139, 224, 176, 0.24)' : '#D7EADF',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.26 : 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  cardIconContainer: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(18, 66, 62, 0.42)' : '#E9F7EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    maxWidth: '100%',
    fontSize: isMobile ? 20 : 22,
    fontWeight: '700',
    color: isDark ? '#F5FFFA' : '#10271C',
    textAlign: 'center',
  },
  cardSubtitle: {
    maxWidth: '100%',
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#BED2C6' : '#425D4D',
    lineHeight: isMobile ? 21 : 24,
    textAlign: 'center',
  },
});
