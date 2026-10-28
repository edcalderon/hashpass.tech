import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import SafeLinearGradient from './SafeLinearGradient';
import { useMotionAllowed } from '../hooks/useMotionAllowed';
import type { WorkshopShimmerProps } from '../types/workshop-shimmer.types';

const BAND = 140;

/**
 * Special-event treatment for workshop cards: a soft diagonal tint of the
 * workshop hue plus a slow highlight that sweeps across the card. It fills the
 * card, ignores touches, and stays still (tint only) when motion is reduced.
 */
export default function WorkshopShimmer({ color, isDark = false, testID }: WorkshopShimmerProps) {
  const motionAllowed = useMotionAllowed();
  const sweep = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!motionAllowed || width === 0) {
      sweep.setValue(0);
      return undefined;
    }
    // First half sweeps across, second half rests off-card before repeating.
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [motionAllowed, sweep, width]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      testID={testID}
      pointerEvents="none"
      onLayout={onLayout}
      style={StyleSheet.absoluteFill}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <SafeLinearGradient
        colors={[`${color}${isDark ? '38' : '24'}`, `${color}00`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {motionAllowed && width > 0 ? (
        <Animated.View
          style={[styles.band, {
            transform: [
              { translateX: sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-BAND, width + BAND, width + BAND] }) },
              { skewX: '-18deg' },
            ],
          }]}
        >
          <SafeLinearGradient
            colors={[`${color}00`, `${color}${isDark ? '42' : '30'}`, `${color}00`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, bottom: 0, width: BAND },
});
