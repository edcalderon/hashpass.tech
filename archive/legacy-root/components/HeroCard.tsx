import React from 'react';
import { View, Text, Platform, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import FlipCard from './FlipCard';
import { Image } from 'expo-image';

interface HeroCardProps {
  title: string;
  description: string;
  ticketImage: string;
  tokenImage: string;
  tokenValue: string;
  delay?: number; // For staggered animation
}

const HeroCard: React.FC<HeroCardProps> = ({
  title,
  description,
  ticketImage,
  tokenImage,
  tokenValue,
  delay = 0,
}) => {
  const isFlipped = useSharedValue(false);
  const translateY = useSharedValue(0);
  const rotateZ = useSharedValue(0); // For subtle tilt

  const cardAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: translateY.value },
        { rotateZ: `${rotateZ.value}deg` },
      ],
    };
  });

  const handleInteractionStart = () => {
    isFlipped.value = !isFlipped.value;
    translateY.value = withSpring(-15); // Pop out effect
    rotateZ.value = withSpring(isFlipped.value ? 5 : -5); // Subtle tilt
  };

  const handleInteractionEnd = () => {
    if (Platform.OS === 'web') { // Only flip back on mouse leave for web
      isFlipped.value = !isFlipped.value;
    }
    translateY.value = withSpring(0);
    rotateZ.value = withSpring(0);
  };

  // For web hover effects
  const webHoverProps = Platform.select({
    web: {
      onMouseEnter: handleInteractionStart,
      onMouseLeave: handleInteractionEnd,
    },
    default: {},
  });

  // For mobile press effects
  const mobilePressGesture = Gesture.Tap()
    .onStart(handleInteractionStart)
    .onEnd(handleInteractionEnd); // End can be used for haptics or other feedback

  // Initial load animation (subtle fade-in and pop-up)
  const initialLoadOpacity = useSharedValue(0);
  const initialLoadTranslateY = useSharedValue(50);

  React.useEffect(() => {
    initialLoadOpacity.value = withDelay(delay, withTiming(1, { duration: 800 }));
    initialLoadTranslateY.value = withDelay(delay, withSpring(0, { damping: 10, stiffness: 100 }));
  }, []);

  const initialLoadStyle = useAnimatedStyle(() => {
    return {
      opacity: initialLoadOpacity.value,
      transform: [{ translateY: initialLoadTranslateY.value }],
    };
  });

  return (
    <Animated.View style={[initialLoadStyle, { width: '100%', height: '100%' }]}>
      <GestureDetector gesture={mobilePressGesture}>
        <Pressable
          className="w-full h-full" // Ensure Pressable takes full size
          {...webHoverProps}
        >
          <Animated.View
            className="w-full h-full rounded-3xl shadow-lg overflow-hidden"
            style={cardAnimatedStyle}
          >
            <FlipCard
              isFlipped={isFlipped}
              cardClassName="w-full h-full bg-surface rounded-3xl border border-border"
              RegularContent={
                <View className="flex-1 p-6 justify-between items-center">
                  <Image
                    source={{ uri: ticketImage }}
                    className="absolute inset-0 w-full h-full object-cover opacity-30"
                    contentFit="cover"
                  />
                  <View className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
                  <Text className="text-text text-2xl font-bold text-center mt-4 z-10">
                    {title}
                  </Text>
                  <Text className="text-textSecondary text-base text-center mb-4 z-10">
                    {description}
                  </Text>
                  <View className="bg-primary/20 border border-primary rounded-full px-4 py-2 z-10">
                    <Text className="text-primary text-sm font-semibold">
                      Tap to reveal token
                    </Text>
                  </View>
                </View>
              }
              FlippedContent={
                <View className="flex-1 p-6 justify-between items-center">
                  <Image
                    source={{ uri: tokenImage }}
                    className="absolute inset-0 w-full h-full object-cover opacity-30"
                    contentFit="cover"
                  />
                  <View className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80" />
                  <Text className="text-text text-3xl font-extrabold text-center mt-4 z-10">
                    {tokenValue}
                  </Text>
                  <Text className="text-accent text-lg font-semibold text-center mb-4 z-10">
                    Your exclusive token!
                  </Text>
                  <View className="bg-accent/20 border border-accent rounded-full px-4 py-2 z-10">
                    <Text className="text-accent text-sm font-semibold">
                      Claim Now!
                    </Text>
                  </View>
                </View>
              }
            />
          </Animated.View>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
};

export default HeroCard;
