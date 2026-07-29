import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export interface PassTiltCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
  isDark?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export interface PassDepthLayerProps {
  children: React.ReactNode;
  /** Parallax offset in px. Web-only; a no-op here (see PassTiltCard.web.tsx). */
  depth?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Native depth layer. There is no per-layer parallax on native by design --
 * the whole card moves as one body (see PassTiltCard below), so an inner
 * layer that also translated would read as the card coming apart.
 */
export const PassDepthLayer: React.FC<PassDepthLayerProps> = ({ children, style, pointerEvents }) => (
  <View style={style} pointerEvents={pointerEvents}>
    {children}
  </View>
);

const PRESS_SPRING = { damping: 18, stiffness: 220, mass: 0.6 };

/**
 * The native half of the pass card's 3D treatment, deliberately simpler than
 * the web one.
 *
 * Web tracks the pointer and tilts the card continuously toward it
 * (PassTiltCard.web.tsx). There is no hovering pointer on a phone, so
 * reproducing that here would mean driving a tilt off raw touch coordinates
 * for a gesture the user is already using to scroll the list -- expensive,
 * and it fights the scroll. Instead the card responds to the one signal a
 * touch device actually gives: press. It settles inward and drops its
 * elevation, which reads as the physical card being pushed into the surface.
 */
const PassTiltCard: React.FC<PassTiltCardProps> = ({
  children,
  style,
  accentColor,
  isDark = false,
  disabled = false,
  onPress,
}) => {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 900 },
      { scale: 1 - pressed.value * 0.02 },
      { translateY: pressed.value * 2 },
    ],
    shadowOpacity: (isDark ? 0.45 : 0.16) - pressed.value * 0.06,
    shadowRadius: 18 - pressed.value * 8,
    elevation: 8 - pressed.value * 4,
  }));

  const handlePressIn = () => {
    if (disabled) return;
    pressed.value = withSpring(1, PRESS_SPRING);
  };

  const handlePressOut = () => {
    if (disabled) return;
    pressed.value = withSpring(0, PRESS_SPRING);
  };

  return (
    <Animated.View
      style={[
        {
          shadowColor: accentColor || '#000000',
          shadowOffset: { width: 0, height: 10 },
        },
        style,
        animatedStyle,
      ]}
    >
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled && !onPress}
        // The card's own buttons live inside; this wrapper only reacts to
        // presses that aren't claimed by them.
        style={{ width: '100%' }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
};

export default PassTiltCard;
