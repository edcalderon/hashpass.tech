import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ActionButton, IconButton } from "@hashpass/ui/primitives";
import {
  uiPalette,
  uiTokens,
  type ColorMode,
} from "@hashpass/ui/tokens";
import {
  NativeSafeIcon,
  type NativeSafeIconName,
} from "../../lib/vector-icons";

type ExplorerHeroActionProps = {
  label: string;
  onPress: () => void;
  mode?: ColorMode;
  style?: StyleProp<ViewStyle>;
};

const EXPANDED_WIDTH = 188;
const EXPANSION_DURATION_MS = 220;

export type ExplorerExpandableActionProps = {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  iconName: NativeSafeIconName;
  iconPosition?: "leading" | "trailing";
  mode?: ColorMode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  expandedWidth?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shared compact-to-expanded action used by explorer heroes and pagination. */
export function ExplorerExpandableAction({
  label,
  accessibilityLabel,
  onPress,
  iconName,
  iconPosition = "leading",
  mode = "light",
  variant = "ghost",
  disabled = false,
  expandedWidth = EXPANDED_WIDTH,
  testID,
  style,
}: ExplorerExpandableActionProps) {
  const [expanded, setExpanded] = useState(false);
  // Default to motion-safe while the OS preference is loading.
  const [reduceMotion, setReduceMotion] = useState(true);
  const expansionProgress = useSharedValue(0);
  const palette = uiPalette(mode);
  const iconColor = disabled
    ? palette.muted
    : variant === "primary"
      ? palette.onAccent
      : palette.accent;
  const icon = (
    <NativeSafeIcon
      name={iconName}
      size={18}
      color={iconColor}
      strokeWidth={2}
    />
  );

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {
        if (active) setReduceMotion(true);
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const nextProgress = expanded ? 1 : 0;
    expansionProgress.value = reduceMotion
      ? nextProgress
      : withTiming(nextProgress, {
          duration: EXPANSION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        });
  }, [expanded, expansionProgress, reduceMotion]);

  const shellAnimatedStyle = useAnimatedStyle(
    () => ({
      width: interpolate(
        expansionProgress.value,
        [0, 1],
        [uiTokens.control.minHeight, expandedWidth],
      ),
    }),
    [expandedWidth],
  );
  const expandedContentAnimatedStyle = useAnimatedStyle(() => ({
    // Wait until the shell has room so a second clipped pill never flashes.
    opacity: expansionProgress.value < 0.98 ? 0 : 1,
  }));

  return (
    <Animated.View
      {...(Platform.OS === "web" && process.env.NODE_ENV !== "test" ? {} : { testID: testID || "explorer-hero-action-shell" })}
      style={[
        styles.shell,
        {
          backgroundColor:
            variant === "primary" ? palette.accentFill : palette.surface,
          borderColor: disabled
            ? palette.border
            : variant === "primary"
              ? palette.accentFill
              : palette.border,
          opacity: disabled ? 0.48 : 1,
        },
        style,
        shellAnimatedStyle,
      ]}
      {...(Platform.OS === "web"
        ? ({
            onMouseLeave: () => setExpanded(false),
            onMouseEnter: () => {
              if (!disabled) setExpanded(true);
            },
          } as any)
        : {})}
    >
      {expanded ? (
        <Animated.View
          style={[styles.expandedContent, expandedContentAnimatedStyle]}
        >
          <ActionButton
            mode={mode}
            variant={variant}
            label={label}
            accessibilityLabel={accessibilityLabel || label}
            accessibilityState={{ expanded: true }}
            disabled={disabled}
            leadingIcon={iconPosition === "leading" ? icon : undefined}
            trailingIcon={iconPosition === "trailing" ? icon : undefined}
            onPress={onPress}
            onBlur={() => setExpanded(false)}
            onFocus={() => {
              if (!disabled) setExpanded(true);
            }}
            style={[styles.expandedAction, { width: expandedWidth }]}
          />
        </Animated.View>
      ) : (
        <IconButton
          mode={mode}
          label={label}
          accessibilityLabel={accessibilityLabel || label}
          accessibilityState={{ expanded: false }}
          disabled={disabled}
          onPress={() => {
            if (!disabled) setExpanded(true);
          }}
          onFocus={() => {
            if (!disabled) setExpanded(true);
          }}
          style={styles.compactAction}
        >
          {icon}
        </IconButton>
      )}
    </Animated.View>
  );
}

/** Matches the landing explorer CTA: compact arrow first, then an actionable pill. */
export default function ExplorerHeroAction({
  label,
  onPress,
  mode = "light",
  style,
}: ExplorerHeroActionProps) {
  return (
    <ExplorerExpandableAction
      label={label}
      onPress={onPress}
      iconName="arrow-up-right"
      mode={mode}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  shell: {
    minHeight: uiTokens.control.minHeight,
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    alignItems: "center",
    flexDirection: "row",
    overflow: "hidden",
    boxShadow: uiTokens.effects.cardShadow,
  },
  expandedContent: {
    minHeight: uiTokens.control.minHeight,
  },
  expandedAction: {
    width: "100%",
    minHeight: uiTokens.control.minHeight,
    flexShrink: 0,
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
  },
  compactAction: {
    width: "100%",
    height: "100%",
    borderWidth: 0,
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
});
