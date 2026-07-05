import React, { FC, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const createLoop = (value: Animated.Value, duration: number) =>
  Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
    ])
  );

export const ShaderAnimation: FC = () => {
  const motionA = useRef(new Animated.Value(0)).current;
  const motionB = useRef(new Animated.Value(0)).current;
  const motionC = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations = [
      createLoop(motionA, 7200),
      createLoop(motionB, 8800),
      createLoop(motionC, 9600),
    ];
    const sheenAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(sheen, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(sheen, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    const timers = animations.map((animation, index) =>
      setTimeout(() => animation.start(), index * 180)
    );
    const sheenTimer = setTimeout(() => sheenAnimation.start(), 240);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(sheenTimer);
      animations.forEach((animation) => animation.stop());
      sheenAnimation.stop();
    };
  }, [motionA, motionB, motionC, sheen]);

  const blobAStyle = {
    opacity: motionA.interpolate({
      inputRange: [0, 1],
      outputRange: [0.28, 0.62],
    }),
    transform: [
      {
        translateX: motionA.interpolate({
          inputRange: [0, 1],
          outputRange: [-120, 84],
        }),
      },
      {
        translateY: motionA.interpolate({
          inputRange: [0, 1],
          outputRange: [24, -76],
        }),
      },
      {
        scale: motionA.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1.18],
        }),
      },
    ],
  };

  const blobBStyle = {
    opacity: motionB.interpolate({
      inputRange: [0, 1],
      outputRange: [0.2, 0.45],
    }),
    transform: [
      {
        translateX: motionB.interpolate({
          inputRange: [0, 1],
          outputRange: [88, -92],
        }),
      },
      {
        translateY: motionB.interpolate({
          inputRange: [0, 1],
          outputRange: [-44, 54],
        }),
      },
      {
        scale: motionB.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.2],
        }),
      },
    ],
  };

  const blobCStyle = {
    opacity: motionC.interpolate({
      inputRange: [0, 1],
      outputRange: [0.16, 0.38],
    }),
    transform: [
      {
        translateX: motionC.interpolate({
          inputRange: [0, 1],
          outputRange: [-56, 58],
        }),
      },
      {
        translateY: motionC.interpolate({
          inputRange: [0, 1],
          outputRange: [88, -48],
        }),
      },
      {
        scale: motionC.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1.12],
        }),
      },
    ],
  };

  const sheenStyle = {
    opacity: sheen.interpolate({
      inputRange: [0, 1],
      outputRange: [0.08, 0.2],
    }),
  };

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.base} />
      <Animated.View style={[styles.glow, styles.glowA, blobAStyle]} />
      <Animated.View style={[styles.glow, styles.glowB, blobBStyle]} />
      <Animated.View style={[styles.glow, styles.glowC, blobCStyle]} />
      <Animated.View style={[styles.sheen, sheenStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  glow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 9999,
  },
  glowA: {
    left: -140,
    top: 120,
    backgroundColor: 'rgba(255, 92, 92, 0.28)',
  },
  glowB: {
    right: -160,
    top: 48,
    backgroundColor: 'rgba(0, 194, 255, 0.24)',
  },
  glowC: {
    left: '34%',
    bottom: -180,
    backgroundColor: 'rgba(255, 233, 92, 0.18)',
  },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
});

export default ShaderAnimation;
