import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
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
    const opacityValue = withTiming(isFlipped.value ? 0 : 1, { duration });

    return {
      transform: [
        isDirectionX ? { rotateX: rotateValue } : { rotateY: rotateValue },
      ],
      opacity: opacityValue,
    };
  });

  const flippedCardAnimatedStyle = useAnimatedStyle(() => {
    const spinValue = interpolate(Number(isFlipped.value), [0, 1], [180, 360]);
    const rotateValue = withTiming(`${spinValue}deg`, { duration });
    const opacityValue = withTiming(isFlipped.value ? 1 : 0, { duration });

    return {
      transform: [
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
