import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { Award, ArrowRightLeft, Gift, TrendingUp, Zap, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';

interface SwapOption {
  id: string;
  targetToken: string;
  rate: string;
  description: string;
  available: boolean;
}

const HashPointsView = () => {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const [pointsBalance] = useState('0');
  const screenWidth = Dimensions.get('window').width;
  const paddingHorizontal = screenWidth < 400 ? 16 : 24;
  // Calculate swap card width: screen width - padding (2x) - margins (24) = responsive width
  // Minimum 260px, maximum 280px
  const swapCardWidth = Math.max(260, Math.min(280, screenWidth - (paddingHorizontal * 2) - 24));
  const cardSpacing = 12;
  
  // Scroll state and refs for Swap Options
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [scrollX, setScrollX] = useState(0);
  const [maxScrollX, setMaxScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const swapOptions: SwapOption[] = [
    {
      id: 'lukas',
      targetToken: 'LUKAS',
      rate: '100 POINTS = 1 LUKAS',
      description: 'Swap to native HashPass token',
      available: true,
    },
    {
      id: 'cop',
      targetToken: 'COP',
      rate: '50 POINTS = 1 COP',
      description: 'Swap to Colombian Peso token',
      available: true,
    },
    {
      id: 'voi',
      targetToken: 'VOI',
      rate: '75 POINTS = 1 VOI',
      description: 'Swap to Voi Network token',
      available: true,
    },
  ];

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const x = contentOffset.x;
    const maxX = Math.max(0, contentSize.width - layoutMeasurement.width);
    setScrollX(x);
    setMaxScrollX(maxX);
    setViewportWidth(layoutMeasurement.width);
    setShowLeftArrow(x > 10);
    setShowRightArrow(x < maxX - 10);
  };

  const scrollTo = (direction: 'left' | 'right') => {
    const delta = Math.max(swapCardWidth, viewportWidth - cardSpacing);
    const target = direction === 'left' ? scrollX - delta : scrollX + delta;
    const nextX = Math.max(0, Math.min(target, maxScrollX));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: nextX, animated: true });
    }
  };

  const handleLayout = (e: any) => {
    const w = e?.nativeEvent?.layout?.width || 0;
    setViewportWidth(w);
    setMaxScrollX(Math.max(0, contentWidth - w));
    // Check if we need to show right arrow initially
    if (contentWidth > w) {
      setShowRightArrow(true);
    }
  };

  const handleContentSizeChange = (w: number, _h: number) => {
    setContentWidth(w);
    setMaxScrollX(Math.max(0, w - viewportWidth));
    // Check if we need to show right arrow
    if (w > viewportWidth) {
      setShowRightArrow(true);
    }
  };

  const handleWheel = (e: any) => {
    // RN Web: map wheel vertical/horizontal delta to horizontal scroll
    const dx = e?.nativeEvent?.deltaX ?? e?.deltaX ?? 0;
    const dy = e?.nativeEvent?.deltaY ?? e?.deltaY ?? 0;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const nextX = Math.max(0, Math.min(scrollX + delta, maxScrollX));
    if (typeof e?.preventDefault === 'function') e.preventDefault();
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: nextX, animated: false });
    }
  };

  const styles = getStyles(isDark, colors);

  return (
    <View style={{ paddingHorizontal }}>
      {/* Points Balance Card */}
      <View
        style={{
          backgroundColor: colors.background.paper,
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
          borderWidth: 1,
          borderColor: colors.divider,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: '#f59e0b20',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16,
            }}
          >
            <Award size={28} color="#f59e0b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                color: colors.text.secondary,
                marginBottom: 4,
              }}
            >
              {t('points.balance')}
            </Text>
            <Text
              style={{
                fontSize: 36,
                fontWeight: '800',
                color: '#f59e0b',
              }}
            >
              {pointsBalance}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: colors.text.secondary,
                marginTop: 4,
              }}
            >
              Hash POINTS
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: colors.divider,
          }}
        >
          <Zap size={16} color={colors.text.secondary} />
          <Text
            style={{
              fontSize: 13,
              color: colors.text.secondary,
              marginLeft: 8,
              flex: 1,
            }}
          >
            {t('points.swappable')}
          </Text>
        </View>
      </View>

      {/* Swap Options */}
      <View style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <ArrowRightLeft size={20} color={colors.text.primary} />
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.text.primary,
              marginLeft: 8,
            }}
          >
            {t('points.swapOptions')}
          </Text>
        </View>

        <View style={styles.scrollContainer}>
          {showLeftArrow && (
            <TouchableOpacity
              style={[styles.scrollArrow, styles.leftArrow]}
              onPress={() => scrollTo('left')}
            >
              <ChevronLeft size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: paddingHorizontal }}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
            snapToInterval={swapCardWidth + cardSpacing}
            snapToAlignment="start"
            disableIntervalMomentum
            onLayout={handleLayout}
            onContentSizeChange={handleContentSizeChange}
            // @ts-ignore - onWheel supported in RN Web
            onWheel={handleWheel}
          >
          {swapOptions.map((option, index) => (
            <View
              key={option.id}
            style={{
              width: swapCardWidth,
              backgroundColor: colors.background.paper,
              borderRadius: 12,
              padding: screenWidth < 400 ? 16 : 20,
              marginRight: index === swapOptions.length - 1 ? 0 : cardSpacing,
              marginLeft: index === 0 ? 0 : 0,
              borderWidth: 1,
              borderColor: colors.divider,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: `${colors.primary}20`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Gift size={20} color={colors.primary} />
                </View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: colors.text.primary,
                  }}
                >
                  {option.targetToken}
                </Text>
              </View>

              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.text.primary,
                  marginBottom: 8,
                }}
              >
                {option.rate}
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                  marginBottom: 16,
                  lineHeight: 16,
                }}
              >
                {option.description}
              </Text>

              <TouchableOpacity
                style={{
                  backgroundColor: option.available ? colors.primary : colors.divider,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
                disabled={!option.available}
              >
                <Text
                  style={{
                    color: option.available ? '#fff' : colors.text.secondary,
                    fontWeight: '600',
                    fontSize: 14,
                  }}
                >
                  {t('points.swapNow')}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          </ScrollView>
          {showRightArrow && (
            <TouchableOpacity
              style={[styles.scrollArrow, styles.rightArrow]}
              onPress={() => scrollTo('right')}
            >
              <ChevronRight size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Recent Activity */}
      <View
        style={{
          backgroundColor: colors.background.paper,
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.divider,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <TrendingUp size={20} color={colors.text.primary} />
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: colors.text.primary,
              marginLeft: 8,
            }}
          >
            {t('points.recentActivity')}
          </Text>
        </View>

        <View
          style={{
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.divider,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: colors.text.primary,
                  marginBottom: 4,
                }}
              >
                {t('points.noActivity')}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                }}
              >
                {t('points.activityDesc')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  scrollContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrow: {
    position: 'absolute',
    zIndex: 1,
    backgroundColor: colors.background.paper,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  leftArrow: {
    left: -10,
  },
  rightArrow: {
    right: -10,
  },
});

export default HashPointsView;

