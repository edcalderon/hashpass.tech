import { uiTokens } from '@hashpass/ui/tokens';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { MaterialIcons } from '../../lib/vector-icons';

type IconLabelRevealButtonProps = {
  label: string;
  loadingLabel?: string;
  color: string;
  surfaceColor: string;
  borderColor: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
};

const CONTROL_SIZE = uiTokens.control.compactHeight;
const LABEL_WIDTH = 104;

const useReducedMotionPreference = (): boolean => {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {
        if (active) setReduceMotion(true);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};

/** Compact reload control that reveals its label on hover or keyboard focus. */
export function IconLabelRevealButton({
  label,
  loadingLabel,
  color,
  surfaceColor,
  borderColor,
  disabled = false,
  loading = false,
  onPress,
  testID,
}: IconLabelRevealButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotionPreference();
  const expansion = useSharedValue(0);
  const expanded = hovered || focused;
  const displayLabel = loading && loadingLabel ? loadingLabel : label;

  useEffect(() => {
    const progress = expanded ? 1 : 0;
    expansion.value = reduceMotion
      ? progress
      : withTiming(progress, {
        duration: uiTokens.motion.fast,
      });
  }, [expanded, expansion, reduceMotion]);

  const shellStyle = useAnimatedStyle(() => ({
    width: CONTROL_SIZE + expansion.value * LABEL_WIDTH,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: expansion.value,
    width: expansion.value * LABEL_WIDTH,
  }));

  return (
    <Animated.View
      style={[
        styles.shell,
        {
          backgroundColor: expanded ? `${color}14` : surfaceColor,
          borderColor: expanded ? `${color}52` : borderColor,
        },
        shellStyle,
      ]}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded, busy: loading }}
        disabled={disabled}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={onPress}
        style={styles.pressable}
      >
        <View style={styles.icon}>
          {loading ? <ActivityIndicator size="small" color={color} /> : <MaterialIcons name="refresh" size={18} color={color} />}
        </View>
        <Animated.View style={[styles.labelClip, labelStyle]}>
          <Text numberOfLines={1} style={[styles.label, { color }]}>{displayLabel}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    height: CONTROL_SIZE,
    overflow: 'hidden',
  },
  pressable: { alignItems: 'center', flexDirection: 'row', height: '100%' },
  icon: {
    alignItems: 'center',
    height: CONTROL_SIZE,
    justifyContent: 'center',
    width: CONTROL_SIZE - uiTokens.control.borderWidth * 2,
  },
  labelClip: { justifyContent: 'center', overflow: 'hidden' },
  label: { fontSize: uiTokens.type.caption, fontWeight: '700', paddingRight: uiTokens.space.sm },
});
