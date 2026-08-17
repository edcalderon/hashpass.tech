import React from "react";
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

interface SliderProgressBarProps {
  count: number;
  activeIndex: number;
  /** 0..1 fill of the active segment, driven on the UI thread. */
  progress: SharedValue<number>;
  onSegmentPress: (index: number) => void;
  containerStyle?: ViewStyle;
  trackStyle?: ViewStyle;
  fillColor?: string;
  accessibilityLabel?: string;
  getSegmentAccessibilityLabel?: (index: number) => string;
}

/**
 * Instagram-Stories-style segmented progress bar: one track per slide, the
 * active track fills 0->1 over the slide's duration (via the shared `progress`
 * value from useAutoAdvanceProgress), earlier tracks stay full, later tracks
 * stay empty. Tapping a track jumps to that slide.
 *
 * This is the single reusable slider/banner progress component -- every
 * hero/carousel in the app that auto-advances slides should render this
 * instead of its own static dots or ad-hoc fill logic.
 */
export function SliderProgressBar({
  count,
  activeIndex,
  progress,
  onSegmentPress,
  containerStyle,
  trackStyle,
  fillColor = "#fff",
  accessibilityLabel,
  getSegmentAccessibilityLabel,
}: SliderProgressBarProps) {
  if (count <= 0) return null;

  return (
    <View style={[styles.row, containerStyle]} accessibilityLabel={accessibilityLabel}>
      {Array.from({ length: count }, (_, index) => (
        <SliderProgressSegment
          key={index}
          isActive={index === activeIndex}
          isPast={index < activeIndex}
          progress={progress}
          onPress={() => onSegmentPress(index)}
          trackStyle={trackStyle}
          fillColor={fillColor}
          accessibilityLabel={getSegmentAccessibilityLabel?.(index)}
        />
      ))}
    </View>
  );
}

function SliderProgressSegment({
  isActive,
  isPast,
  progress,
  onPress,
  trackStyle,
  fillColor,
  accessibilityLabel,
}: {
  isActive: boolean;
  isPast: boolean;
  progress: SharedValue<number>;
  onPress: () => void;
  trackStyle?: ViewStyle;
  fillColor: string;
  accessibilityLabel?: string;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    width: isActive
      ? `${Math.round(progress.value * 100)}%`
      : isPast
        ? "100%"
        : "0%",
  }));

  return (
    <TouchableOpacity
      style={[styles.track, trackStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        style={[styles.fill, { backgroundColor: fillColor }, animatedStyle]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.28)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
  },
});
