import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

interface LiquidEffectAnimationProps {
  isDark?: boolean;
  colors?: {
    background: {
      default: string;
    };
  };
}

export function LiquidEffectAnimation({ isDark = false, colors }: LiquidEffectAnimationProps) {
  // Create multiple animated values for fluid movement
  const animation1 = useSharedValue(0);
  const animation2 = useSharedValue(0);
  const animation3 = useSharedValue(0);
  const animation4 = useSharedValue(0);
  const animation5 = useSharedValue(0);

  useEffect(() => {
    // Start all animations with different durations and delays for organic movement
    animation1.value = withRepeat(
      withTiming(1, {
        duration: 8000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    animation2.value = withRepeat(
      withTiming(1, {
        duration: 10000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    animation3.value = withRepeat(
      withTiming(1, {
        duration: 12000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    animation4.value = withRepeat(
      withTiming(1, {
        duration: 9000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
    animation5.value = withRepeat(
      withTiming(1, {
        duration: 11000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );
  }, []);

  // Extract RGB values from background color for opacity variations
  const getBgRgb = () => {
    const bgColor = colors?.background?.default || (isDark ? '#121212' : '#FFFFFF');
    const hex = bgColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
  };

  const bgRgb = getBgRgb();

  // Animated styles for each liquid blob - smaller movements for header
  const liquidStyle1 = useAnimatedStyle(() => {
    const translateX = interpolate(animation1.value, [0, 1], [-50, 50]);
    const translateY = interpolate(animation1.value, [0, 0.5, 1], [-30, 10, -30]);
    const scale = interpolate(animation1.value, [0, 0.5, 1], [0.9, 1.1, 0.9]);
    
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const liquidStyle2 = useAnimatedStyle(() => {
    const translateX = interpolate(animation2.value, [0, 1], [50, -50]);
    const translateY = interpolate(animation2.value, [0, 0.5, 1], [30, -10, 30]);
    const scale = interpolate(animation2.value, [0, 0.5, 1], [1.0, 0.85, 1.0]);
    
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const liquidStyle3 = useAnimatedStyle(() => {
    const translateX = interpolate(animation3.value, [0, 1], [-40, 40]);
    const translateY = interpolate(animation3.value, [0, 0.5, 1], [-20, 20, -20]);
    const scale = interpolate(animation3.value, [0, 0.5, 1], [0.95, 1.15, 0.95]);
    
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const liquidStyle4 = useAnimatedStyle(() => {
    const translateX = interpolate(animation4.value, [0, 1], [40, -40]);
    const translateY = interpolate(animation4.value, [0, 0.5, 1], [20, -20, 20]);
    const scale = interpolate(animation4.value, [0, 0.5, 1], [1.05, 0.9, 1.05]);
    
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  const liquidStyle5 = useAnimatedStyle(() => {
    const translateX = interpolate(animation5.value, [0, 1], [-35, 35]);
    const translateY = interpolate(animation5.value, [0, 0.5, 1], [15, -15, 15]);
    const scale = interpolate(animation5.value, [0, 0.5, 1], [0.9, 1.05, 0.9]);
    
    return {
      transform: [{ translateX }, { translateY }, { scale }],
    };
  });

  // Liquid blob colors based on theme - using more visible colors
  const liquidColors = isDark
    ? [
        'rgba(175, 13, 1, 0.3)',      // Red primary
        'rgba(161, 209, 214, 0.25)',  // Cyan
        'rgba(255, 215, 0, 0.2)',     // Gold
        'rgba(255, 87, 34, 0.22)',    // Orange
        'rgba(175, 13, 1, 0.18)',     // Red variant
      ]
    : [
        'rgba(0, 122, 255, 0.25)',   // Blue
        'rgba(100, 181, 246, 0.2)',   // Light blue
        'rgba(63, 81, 181, 0.18)',    // Indigo
        'rgba(30, 58, 138, 0.15)',    // Dark blue
        'rgba(0, 122, 255, 0.12)',    // Blue variant
      ];

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Liquid blob 1 - smaller sizes for header */}
      <Animated.View
        style={[
          styles.liquidBlob,
          {
            backgroundColor: liquidColors[0],
            width: 150,
            height: 150,
            borderRadius: 75,
            top: -30,
            left: '10%',
          },
          liquidStyle1,
        ]}
      />
      
      {/* Liquid blob 2 */}
      <Animated.View
        style={[
          styles.liquidBlob,
          {
            backgroundColor: liquidColors[1],
            width: 120,
            height: 120,
            borderRadius: 60,
            top: -20,
            right: '15%',
          },
          liquidStyle2,
        ]}
      />
      
      {/* Liquid blob 3 */}
      <Animated.View
        style={[
          styles.liquidBlob,
          {
            backgroundColor: liquidColors[2],
            width: 140,
            height: 140,
            borderRadius: 70,
            bottom: -25,
            left: '20%',
          },
          liquidStyle3,
        ]}
      />
      
      {/* Liquid blob 4 */}
      <Animated.View
        style={[
          styles.liquidBlob,
          {
            backgroundColor: liquidColors[3],
            width: 110,
            height: 110,
            borderRadius: 55,
            top: -15,
            left: '50%',
          },
          liquidStyle4,
        ]}
      />
      
      {/* Liquid blob 5 */}
      <Animated.View
        style={[
          styles.liquidBlob,
          {
            backgroundColor: liquidColors[4],
            width: 130,
            height: 130,
            borderRadius: 65,
            bottom: -20,
            right: '25%',
          },
          liquidStyle5,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  liquidBlob: {
    position: 'absolute',
  },
});

