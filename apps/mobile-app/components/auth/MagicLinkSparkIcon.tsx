import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "../../lib/vector-icons";
import type { MagicLinkSparkIconProps } from "./types/MagicLinkSparkIcon.types";

/**
 * A small, decorative confirmation that the selected sign-in method delivers
 * a link. The sequence is intentionally sparse: the link gives a tiny lift,
 * then three four-point glints appear and settle before the next quiet beat.
 */
const MagicLinkSparkIcon = ({
  color,
  isActive,
  animationLevel,
  size = 20,
}: MagicLinkSparkIconProps) => {
  // Begin static so people who opt into the system Reduce Motion setting never
  // receive a one-frame autoplay flash while its async preference resolves.
  const [systemReducedMotion, setSystemReducedMotion] = useState(true);
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;
    const preference = AccessibilityInfo.isReduceMotionEnabled?.();

    if (preference && typeof preference.then === "function") {
      void preference
        .then((enabled) => {
          if (isMounted) setSystemReducedMotion(enabled);
        })
        .catch(() => {
          if (isMounted) setSystemReducedMotion(false);
        });
    } else {
      setSystemReducedMotion(false);
    }

    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      setSystemReducedMotion,
    );

    return () => {
      isMounted = false;
      subscription?.remove?.();
    };
  }, []);

  const shouldAnimate =
    isActive && animationLevel === "full" && !systemReducedMotion;
  const showsStaticSparks =
    isActive && animationLevel !== "none" && !shouldAnimate;

  useEffect(() => {
    phase.stopAnimation();

    if (!shouldAnimate) {
      phase.setValue(0);
      return;
    }

    phase.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(180),
        Animated.timing(phase, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(phase, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [phase, shouldAnimate]);

  const linkScale = shouldAnimate
    ? phase.interpolate({
        inputRange: [0, 0.35, 0.7, 1],
        outputRange: [1, 1.08, 0.99, 1],
      })
    : 1;
  const linkTranslateY = shouldAnimate
    ? phase.interpolate({
        inputRange: [0, 0.35, 0.7, 1],
        outputRange: [0, -1, 0, 0],
      })
    : 0;
  const sparkOpacity = shouldAnimate
    ? phase.interpolate({
        inputRange: [0, 0.16, 0.74, 1],
        outputRange: [0, 1, 0.92, 0],
      })
    : showsStaticSparks
      ? 0.82
      : 0;
  const sparkScale = shouldAnimate
    ? phase.interpolate({
        inputRange: [0, 0.2, 0.72, 1],
        outputRange: [0.35, 1, 0.82, 0.35],
      })
    : 1;
  const primarySparkTranslateY = shouldAnimate
    ? phase.interpolate({
        inputRange: [0, 1],
        outputRange: [2, -2],
      })
    : 0;
  const trailingSparkTranslateX = shouldAnimate
    ? phase.interpolate({
        inputRange: [0, 1],
        outputRange: [-2, 1],
      })
    : 0;

  return (
    <View
      accessible={false}
      style={[styles.container, { width: size, height: size, pointerEvents: "none" }]}
      testID="magic-link-spark-icon"
    >
      <Animated.View
        style={{
          transform: [{ translateY: linkTranslateY }, { scale: linkScale }],
        }}
      >
        <Ionicons name="link-outline" size={size - 2} color={color} />
      </Animated.View>

      <Animated.View
        style={[
          styles.spark,
          styles.primarySpark,
          {
            backgroundColor: color,
            opacity: sparkOpacity,
            transform: [
              { translateY: primarySparkTranslateY },
              { rotate: "45deg" },
              { scale: sparkScale },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.spark,
          styles.secondarySpark,
          {
            backgroundColor: color,
            opacity: sparkOpacity,
            transform: [{ rotate: "45deg" }, { scale: sparkScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.spark,
          styles.trailingSpark,
          {
            backgroundColor: color,
            opacity: sparkOpacity,
            transform: [
              { translateX: trailingSparkTranslateX },
              { rotate: "45deg" },
              { scale: sparkScale },
            ],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  spark: {
    position: "absolute",
  },
  primarySpark: {
    top: 0,
    right: 0,
    width: 5,
    height: 5,
  },
  secondarySpark: {
    top: 3,
    left: 1,
    width: 3,
    height: 3,
  },
  trailingSpark: {
    bottom: 1,
    left: 0,
    width: 3,
    height: 3,
  },
});

export default MagicLinkSparkIcon;
