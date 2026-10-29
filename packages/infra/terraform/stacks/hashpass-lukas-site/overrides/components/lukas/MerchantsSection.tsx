import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import type { MerchantCategory, MerchantCategoryCardProps } from '../../types/MerchantsSection.types';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { LukasGlyph } from './LukasGlyph';
import { lukasPalette, lukasSectionTitle } from './lukas-ui';

function MerchantCategoryCard({ category, opacity, translateY, styles }: MerchantCategoryCardProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      <View style={styles.cardIconContainer}>
        <LukasGlyph name={category.glyph} size={72} />
      </View>
      <Text style={styles.cardTitle}>{category.title}</Text>
      <Text style={styles.cardSubtitle}>{category.subtitle}</Text>
    </Animated.View>
  );
}

export function MerchantsSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');

  const cardOpacity0 = useSharedValue(0);
  const cardOpacity1 = useSharedValue(0);
  const cardOpacity2 = useSharedValue(0);
  const cardOpacity3 = useSharedValue(0);
  const cardTranslate0 = useSharedValue(30);
  const cardTranslate1 = useSharedValue(30);
  const cardTranslate2 = useSharedValue(30);
  const cardTranslate3 = useSharedValue(30);
  const cardOpacities = [cardOpacity0, cardOpacity1, cardOpacity2, cardOpacity3];
  const cardTranslates = [cardTranslate0, cardTranslate1, cardTranslate2, cardTranslate3];

  useEffect(() => {
    [cardOpacity0, cardOpacity1, cardOpacity2, cardOpacity3].forEach((opacity, index) => {
      opacity.value = withDelay(index * 150, withTiming(1, { duration: 600 }));
    });
    [cardTranslate0, cardTranslate1, cardTranslate2, cardTranslate3].forEach((translate, index) => {
      translate.value = withDelay(index * 150, withTiming(0, { duration: 600 }));
    });
  }, [cardOpacity0, cardOpacity1, cardOpacity2, cardOpacity3, cardTranslate0, cardTranslate1, cardTranslate2, cardTranslate3]);

  const styles = getStyles(isDark, colors, isMobile);

  const merchantCategories = [
    {
      title: t('merchants.category1.title'),
      subtitle: t('merchants.category1.subtitle'),
      glyph: 'event',
    },
    {
      title: t('merchants.category2.title'),
      subtitle: t('merchants.category2.subtitle'),
      glyph: 'coffee',
    },
    {
      title: t('merchants.category3.title'),
      subtitle: t('merchants.category3.subtitle'),
      glyph: 'wallet',
    },
    {
      title: t('merchants.category4.title'),
      subtitle: t('merchants.category4.subtitle'),
      glyph: 'market',
    },
  ] satisfies MerchantCategory[];

  const cards = merchantCategories.map((category, index) => (
    <MerchantCategoryCard
      key={category.glyph}
      category={category}
      opacity={cardOpacities[index]}
      translateY={cardTranslates[index]}
      styles={styles}
    />
  ));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('merchants.title')}
      </Text>

      {isMobile ? (
        <View style={styles.cardsContainer}>{cards}</View>
      ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cardsContainer}
          style={styles.scrollView}
        >
          {cards}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  title: { ...lukasSectionTitle(lukasPalette(isDark), isMobile), marginBottom: isMobile ? 40 : 60 },
  scrollView: {
    width: '100%',
    flexGrow: 0,
  },
  cardsContainer: {
    width: '100%',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? 16 : 18,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  card: {
    width: isMobile ? '100%' : 250,
    maxWidth: '100%',
    alignSelf: 'stretch',
    flexShrink: 1,
    marginBottom: 0,
    padding: isMobile ? 20 : 24,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(7, 28, 42, 0.72)' : 'rgba(247, 252, 249, 0.92)',
    borderWidth: 1,
    borderColor: lukasPalette(isDark).border,
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
    backgroundColor: 'transparent',
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
