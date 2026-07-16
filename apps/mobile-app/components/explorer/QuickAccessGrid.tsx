import React, { useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { MaterialIcons } from '../../lib/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../../hooks/useTheme';

interface QuickAccessItem {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  icon: string;
  color: string;
  route: string;
}

interface QuickAccessGridProps {
  items: QuickAccessItem[];
  title?: string;
  showScrollArrows?: boolean;
  onItemPress?: (item: QuickAccessItem) => void;
  cardWidth?: number;
  cardSpacing?: number;
}

export default function QuickAccessGrid({ 
  items, 
  title = "Quick Access", 
  showScrollArrows = false,
  onItemPress,
  cardWidth = 132,
  cardSpacing = 10
}: QuickAccessGridProps) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors, cardWidth, cardSpacing);
  
  const scrollXRef = useRef(0);
  const maxScrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const leftArrowOpacity = useSharedValue(0.32);
  const rightArrowOpacity = useSharedValue(1);
  const leftArrowStyle = useAnimatedStyle(() => ({
    opacity: leftArrowOpacity.value,
  }));
  const rightArrowStyle = useAnimatedStyle(() => ({
    opacity: rightArrowOpacity.value,
  }));

  const updateArrowVisibility = (scrollX: number, maxScrollX: number) => {
    if (!showScrollArrows) return;

    const canScrollLeft = scrollX > 0;
    const canScrollRight = scrollX < maxScrollX - 10;

    leftArrowOpacity.value = canScrollLeft ? 1 : 0.32;
    rightArrowOpacity.value = canScrollRight ? 1 : 0.32;
  };

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const x = contentOffset.x;
    const maxX = Math.max(0, contentSize.width - layoutMeasurement.width);
    scrollXRef.current = x;
    maxScrollXRef.current = maxX;
    viewportWidthRef.current = layoutMeasurement.width;
    updateArrowVisibility(x, maxX);
  };

  const scrollTo = (direction: 'left' | 'right') => {
    const delta = Math.max(160, viewportWidthRef.current - cardSpacing);
    const target = direction === 'left'
      ? scrollXRef.current - delta
      : scrollXRef.current + delta;
    const nextX = Math.max(0, Math.min(target, maxScrollXRef.current));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: nextX, animated: true });
    }
  };

  const handleLayout = (e: any) => {
    const w = e?.nativeEvent?.layout?.width || 0;
    viewportWidthRef.current = w;
    maxScrollXRef.current = Math.max(0, contentWidthRef.current - w);
    updateArrowVisibility(scrollXRef.current, maxScrollXRef.current);
  };

  const handleContentSizeChange = (w: number, _h: number) => {
    contentWidthRef.current = w;
    maxScrollXRef.current = Math.max(0, w - viewportWidthRef.current);
    updateArrowVisibility(scrollXRef.current, maxScrollXRef.current);
  };

  const handleWheel = (e: any) => {
    // RN Web: map wheel vertical/horizontal delta to horizontal scroll
    const dx = e?.nativeEvent?.deltaX ?? e?.deltaX ?? 0;
    const dy = e?.nativeEvent?.deltaY ?? e?.deltaY ?? 0;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const nextX = Math.max(0, Math.min(scrollXRef.current + delta, maxScrollXRef.current));
    if (typeof e?.preventDefault === 'function') e.preventDefault();
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: nextX, animated: false });
    }
  };

  const handleItemPress = (item: QuickAccessItem) => {
    if (onItemPress) {
      onItemPress(item);
    } else {
      router.push(item.route as any);
    }
  };

  const renderQuickAccessItem = (item: QuickAccessItem, index: number) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.quickAccessCard,
        { marginLeft: index === 0 ? 0 : cardSpacing }
      ]}
      onPress={() => handleItemPress(item)}
    >
      <View style={[styles.cardIcon, { backgroundColor: item.color + '20' }]}>
        <MaterialIcons name={item.icon as any} size={24} color={item.color} />
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.cardDescription} numberOfLines={2}>
        {item.subtitle || item.description}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.quickAccessContainer}>
        {showScrollArrows && (
          <Animated.View style={[styles.scrollArrow, styles.leftArrow, leftArrowStyle]}>
            <TouchableOpacity
              style={styles.scrollArrowButton}
              onPress={() => scrollTo('left')}
            >
              <MaterialIcons name="chevron-left" size={24} color={colors.primary} />
            </TouchableOpacity>
          </Animated.View>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalScroll}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={cardWidth + cardSpacing}
          snapToAlignment="start"
          disableIntervalMomentum
          onLayout={Platform.OS === 'android' ? undefined : handleLayout}
          onContentSizeChange={handleContentSizeChange}
          // @ts-ignore - onWheel supported in RN Web
          onWheel={handleWheel}
        >
          {items.map((item, index) => renderQuickAccessItem(item, index))}
        </ScrollView>
        {showScrollArrows && (
          <Animated.View style={[styles.scrollArrow, styles.rightArrow, rightArrowStyle]}>
            <TouchableOpacity
              style={styles.scrollArrowButton}
              onPress={() => scrollTo('right')}
            >
              <MaterialIcons name="chevron-right" size={24} color={colors.primary} />
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, cardWidth: number, cardSpacing: number) => StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  horizontalScroll: {
    paddingRight: 16,
  },
  quickAccessContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrow: {
    position: 'absolute',
    zIndex: 1,
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 18,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: isDark
      ? '0 2px 4px rgba(0, 0, 0, 0.20)'
      : '0 2px 4px rgba(15, 23, 42, 0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  leftArrow: {
    left: -8,
  },
  rightArrow: {
    right: -8,
  },
  scrollArrowButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAccessCard: {
    width: cardWidth,
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    minHeight: 120,
    boxShadow: isDark
      ? '0 4px 10px rgba(0, 0, 0, 0.16)'
      : '0 4px 10px rgba(15, 23, 42, 0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    textAlign: 'left',
    marginBottom: 4,
    lineHeight: 16,
  },
  cardDescription: {
    fontSize: 11,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    textAlign: 'left',
    lineHeight: 14,
  },
});
