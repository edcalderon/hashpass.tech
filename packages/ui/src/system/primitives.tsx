import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewStyle,
  type ViewProps,
} from "react-native";
import { uiPalette, uiTokens, type ColorMode } from "./tokens";
type Themed = { mode?: ColorMode };
export function Surface({
  mode = "light",
  style,
  ...props
}: ViewProps & Themed) {
  const palette = uiPalette(mode);
  return (
    <View
      {...props}
      style={[
        styles.surface,
        { backgroundColor: palette.surface, borderColor: palette.border },
        style,
      ]}
    />
  );
}
export function Badge({
  mode = "light",
  children,
  tone = "accent",
  radius,
  markerColor,
  leadingIcon,
  compact = false,
}: React.PropsWithChildren<
  Themed & {
    tone?: "accent" | "neutral" | "onMedia";
    radius?: number;
    markerColor?: string;
    leadingIcon?: React.ReactNode;
    compact?: boolean;
  }
>) {
  const palette = uiPalette(mode);
  const onMedia = tone === "onMedia";
  return (
    <View
      style={[
        styles.badge,
        compact && styles.badgeCompact,
        radius === undefined ? undefined : { borderRadius: radius },
        {
          backgroundColor: onMedia
            ? "#111114e6"
            : tone === "accent"
              ? palette.accentSoft
              : palette.surface,
          borderColor: onMedia ? "#ffffff40" : palette.border,
        },
      ]}
    >
      <View style={styles.badgeContent}>
        {markerColor ? (
          <View
            accessible={false}
            style={[styles.badgeMarker, { backgroundColor: markerColor }]}
          />
        ) : null}
        {leadingIcon ? (
          <View accessible={false} pointerEvents="none">
            {leadingIcon}
          </View>
        ) : null}
        <Text
          style={[
            styles.badgeLabel,
            compact && styles.badgeLabelCompact,
            {
              color: onMedia
                ? "#ffffff"
                : tone === "accent"
                  ? palette.accent
                  : palette.muted,
            },
          ]}
        >
          {children}
        </Text>
      </View>
    </View>
  );
}
export type ActionButtonProps = Omit<PressableProps, "children"> &
  Themed & {
    label: string;
    leadingIcon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
    variant?: "primary" | "secondary" | "ghost";
    loading?: boolean;
  };
export function ActionButton({
  mode = "light",
  label,
  leadingIcon,
  trailingIcon,
  variant = "primary",
  loading = false,
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  ...props
}: ActionButtonProps) {
  const palette = uiPalette(mode);
  const blocked = disabled || loading;
  const foreground = variant === "primary" ? palette.onAccent : palette.accent;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      disabled={blocked}
      accessibilityState={{
        ...accessibilityState,
        disabled: !!blocked,
        busy: loading,
      }}
      style={(state) => [
        styles.button,
        {
          opacity: blocked ? 0.45 : state.pressed ? 0.75 : 1,
          backgroundColor:
            variant === "primary"
              ? palette.accentFill
              : variant === "secondary"
                ? palette.accentSoft
                : "transparent",
          borderColor:
            variant === "ghost"
              ? "transparent"
              : variant === "primary"
                ? palette.accentFill
                : palette.border,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : leadingIcon && <View accessible={false} pointerEvents="none">{leadingIcon}</View>}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
      {!loading && trailingIcon ? <View accessible={false} pointerEvents="none">{trailingIcon}</View> : null}
    </Pressable>
  );
}
export function FilterChip({
  selected = false,
  style,
  ...props
}: Omit<ActionButtonProps, "variant" | "loading"> & { selected?: boolean }) {
  return (
    <ActionButton
      {...props}
      variant={selected ? "secondary" : "ghost"}
      accessibilityState={{ ...props.accessibilityState, selected }}
      style={(state) => [
        styles.chip,
        typeof style === "function" ? style(state) : style,
      ]}
    />
  );
}
/** Compact account/tool action; consumers supply the shared icon renderer. */
export type IconButtonProps = Omit<PressableProps, "children"> &
  Themed & {
    label: string;
    children: React.ReactNode;
    /** Reveals the accessible label on hover or keyboard focus. */
    revealLabel?: boolean;
    /** Lets contextual tools retain their semantic accent while sharing this role. */
    accentColor?: string;
    loading?: boolean;
    loadingLabel?: string;
  };

export function IconButton({
  mode = "light",
  label,
  children,
  disabled,
  style,
  revealLabel = false,
  accentColor,
  loading = false,
  loadingLabel,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...props
}: IconButtonProps) {
  const palette = uiPalette(mode);
  const color = accentColor || palette.accent;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const expanded = revealLabel && (hovered || focused);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {
        if (active) setReduceMotion(true);
      });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  const content = loading
    ? <ActivityIndicator size="small" color={color} />
    : children;

  if (revealLabel) {
    const transitionStyle = Platform.OS === "web" && !reduceMotion
      ? ({
          transitionDuration: `${uiTokens.motion.fast}ms`,
          transitionProperty: "width, background-color, border-color, opacity",
          transitionTimingFunction: "ease-out",
        } as ViewStyle)
      : undefined;
    return (
      <View
        style={[
          styles.revealIconButton,
          {
            width: expanded ? uiTokens.control.compactHeight + 104 : uiTokens.control.compactHeight,
            backgroundColor: expanded ? `${color}14` : palette.surface,
            borderColor: expanded ? `${color}52` : palette.border,
          },
          transitionStyle,
        ]}
      >
        <Pressable
          {...props}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ ...props.accessibilityState, disabled: !!disabled, expanded, busy: loading }}
          disabled={disabled || loading}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onHoverIn={(event) => {
            setHovered(true);
            onHoverIn?.(event);
          }}
          onHoverOut={(event) => {
            setHovered(false);
            onHoverOut?.(event);
          }}
          style={styles.revealIconButtonPressable}
        >
          <View accessible={false} pointerEvents="none" style={styles.revealIcon}>{content}</View>
          <View style={[styles.revealLabelClip, { opacity: expanded ? 1 : 0 }, transitionStyle]}>
            <Text numberOfLines={1} style={[styles.revealLabel, { color }]}>{loading && loadingLabel ? loadingLabel : label}</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      accessibilityState={{ ...props.accessibilityState, disabled: !!disabled }}
      style={(state) => [
        styles.iconButton,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : state.pressed ? 0.7 : 1,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {children}
    </Pressable>
  );
}
/** Translucent blue scrim; web adds blur, native stays inexpensive and keyboard-safe. */
export function ModalBackdrop({
  mode = "light",
  style,
  ...props
}: ViewProps & Themed) {
  const webBlur =
    Platform.OS === "web"
      ? ({
          backdropFilter: `blur(${uiTokens.effects.modalBlur}px)`,
          WebkitBackdropFilter: `blur(${uiTokens.effects.modalBlur}px)`,
        } as ViewStyle)
      : undefined;
  return (
    <KeyboardAvoidingView
      {...props}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[
        styles.backdrop,
        { backgroundColor: uiPalette(mode).overlay },
        webBlur,
        style,
      ]}
    />
  );
}
export function FormField({
  mode = "light",
  label,
  error,
  style,
  ...props
}: TextInputProps & Themed & { label: string; error?: string }) {
  const palette = uiPalette(mode);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.text }]}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={props.accessibilityLabel || label}
        placeholderTextColor={palette.muted}
        style={[
          styles.input,
          {
            color: palette.text,
            backgroundColor: palette.raised,
            borderColor: error ? palette.danger : palette.border,
          },
          style,
        ]}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: palette.danger, fontSize: uiTokens.type.caption }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  revealIconButton: {
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    height: uiTokens.control.compactHeight,
    overflow: "hidden",
  },
  revealIconButtonPressable: {
    alignItems: "center",
    flexDirection: "row",
    height: "100%",
  },
  revealIcon: {
    alignItems: "center",
    height: uiTokens.control.compactHeight,
    justifyContent: "center",
    width: uiTokens.control.compactHeight,
  },
  revealLabelClip: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  revealLabel: {
    fontSize: uiTokens.type.caption,
    fontWeight: "700",
    paddingRight: uiTokens.space.md,
  },
  iconButton: {
    width: uiTokens.control.compactHeight,
    height: uiTokens.control.compactHeight,
    borderRadius: uiTokens.radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: uiTokens.space.lg,
  },
  surface: {
    borderWidth: uiTokens.control.borderWidth,
    borderRadius: uiTokens.radius.card,
    padding: uiTokens.space.xl,
  },
  badge: {
    alignSelf: "center",
    borderRadius: uiTokens.radius.pill,
    minHeight: uiTokens.control.badgeHeight,
    paddingHorizontal: uiTokens.space.lg,
    paddingVertical: uiTokens.space.sm,
    borderWidth: uiTokens.control.borderWidth,
    justifyContent: "center",
    maxWidth: "100%",
  },
  badgeCompact: {
    paddingHorizontal: uiTokens.space.sm,
    paddingVertical: uiTokens.space.xs,
  },
  badgeContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: uiTokens.space.xs,
  },
  badgeMarker: {
    width: uiTokens.space.sm,
    height: uiTokens.space.sm,
    borderRadius: uiTokens.radius.circle,
  },
  badgeLabel: {
    fontSize: uiTokens.type.caption,
    lineHeight: 16,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  badgeLabelCompact: {
    letterSpacing: 0.4,
  },
  button: {
    minHeight: uiTokens.control.minHeight,
    borderRadius: uiTokens.radius.pill,
    paddingHorizontal: uiTokens.space.xl,
    paddingVertical: uiTokens.space.md,
    borderWidth: uiTokens.control.borderWidth,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    gap: uiTokens.space.sm,
    alignSelf: "flex-start",
  },
  buttonLabel: {
    fontSize: uiTokens.type.label,
    lineHeight: 20,
    fontWeight: "600",
    textAlign: "center",
    flexShrink: 1,
  },
  chip: {
    minHeight: uiTokens.control.compactHeight,
    paddingHorizontal: uiTokens.space.lg,
    paddingVertical: uiTokens.space.sm,
  },
  field: { gap: uiTokens.space.sm },
  fieldLabel: {
    fontSize: uiTokens.type.label,
    lineHeight: 20,
    fontWeight: "600",
  },
  input: {
    minHeight: uiTokens.control.minHeight,
    borderRadius: uiTokens.radius.input,
    borderWidth: uiTokens.control.borderWidth,
    paddingHorizontal: uiTokens.space.lg,
    paddingVertical: uiTokens.space.md,
    fontSize: uiTokens.type.body,
  },
});
