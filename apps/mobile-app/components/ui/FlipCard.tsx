import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';

interface FlipCardProps {
  isFlipped: SharedValue<boolean>;
  cardClassName?: string; // Use className for NativeWind
  direction?: 'x' | 'y';
  duration?: number;
  RegularContent: React.ReactNode;
  FlippedContent: React.ReactNode;
}

const FlipCard: React.FC<FlipCardProps> = ({
  isFlipped,
  cardClassName,
  direction = 'y',
  duration = 500,
  RegularContent,
  FlippedContent,
}) => {
  const isDirectionX = direction === 'x';

  const regularCardAnimatedStyle = useAnimatedStyle(() => {
    const spinValue = interpolate(Number(isFlipped.value), [0, 1], [0, 180]);
    const rotateValue = withTiming(`${spinValue}deg`, { duration });

    return {
      transform: [
        isDirectionX ? { rotateX: rotateValue } : { rotateY: rotateValue },
      ],
      backfaceVisibility: 'hidden', // Crucial for flip effect
    };
  });

  const flippedCardAnimatedStyle = useAnimatedStyle(() => {
    const spinValue = interpolate(Number(isFlipped.value), [0, 1], [180, 360]);
    const rotateValue = withTiming(`${spinValue}deg`, { duration });

    return {
      transform: [
        isDirectionX ? { rotateX: rotateValue } : { rotateY: rotateValue },
      ],
      backfaceVisibility: 'hidden', // Crucial for flip effect
    };
  });

  return (
    <View style={flipCardStyles.container}>
      <Animated.View
        className={cardClassName}
        style={[
          flipCardStyles.cardBase,
          regularCardAnimatedStyle,
        ]}>
        {RegularContent}
      </Animated.View>
      <Animated.View
        className={cardClassName}
        style={[
          flipCardStyles.cardBase,
          flippedCardAnimatedStyle,
        ]}>
        {FlippedContent}
      </Animated.View>
    </View>
  );
};

const flipCardStyles = StyleSheet.create({
  container: {
    position: 'relative',
    perspective: '1000', // Crucial for 3D effect
  },
  cardBase: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default FlipCard;
