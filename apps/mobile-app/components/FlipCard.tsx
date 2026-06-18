import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withDelay,
  interpolate,
  SharedValue,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

interface FlipCardProps {
  isFlipped: SharedValue<boolean>;
  cardClassName?: string;
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

  const containerStyle = {
    width: '100%',
    aspectRatio: 1, // Keep it square
    borderRadius: 16,
    overflow: 'hidden',
  };

  const cardStyle = {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  } as const;

  const regularCardAnimatedStyle = useAnimatedStyle(() => {
    const spinValue = interpolate(Number(isFlipped.value), [0, 1], [0, 180]);
    const rotateValue = withTiming(`${spinValue}deg`, { duration });
    // Fade out in the first half of the flip so the back face never shows through
    const opacityValue = withTiming(isFlipped.value ? 0 : 1, { duration: duration / 2 });

    return {
      transform: [
        { perspective: 1000 },
        isDirectionX ? { rotateX: rotateValue } : { rotateY: rotateValue },
      ],
      opacity: opacityValue,
    };
  });

  const flippedCardAnimatedStyle = useAnimatedStyle(() => {
    const spinValue = interpolate(Number(isFlipped.value), [0, 1], [180, 360]);
    const rotateValue = withTiming(`${spinValue}deg`, { duration });
    // Fade in during the second half of the flip
    const opacityValue = isFlipped.value
      ? withDelay(duration / 2, withTiming(1, { duration: duration / 2 }))
      : withTiming(0, { duration: duration / 2 });

    return {
      transform: [
        { perspective: 1000 },
        isDirectionX ? { rotateX: rotateValue } : { rotateY: rotateValue },
      ],
      opacity: opacityValue,
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.card, cardStyle, regularCardAnimatedStyle]}>
        {RegularContent}
      </Animated.View>
      <Animated.View style={[styles.card, cardStyle, flippedCardAnimatedStyle]}>
        {FlippedContent}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});

export default FlipCard;
