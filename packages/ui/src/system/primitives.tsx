import React from "react";
import {
  ActivityIndicator,
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
}: React.PropsWithChildren<
  Themed & { tone?: "accent" | "neutral" | "onMedia" }
>) {
  const palette = uiPalette(mode);
  const onMedia = tone === "onMedia";
  return (
    <View
      style={[
        styles.badge,
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
      <Text
        style={[
          styles.badgeLabel,
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
  );
}
export type ActionButtonProps = Omit<PressableProps, "children"> &
  Themed & {
    label: string;
    leadingIcon?: React.ReactNode;
    variant?: "primary" | "secondary" | "ghost";
    loading?: boolean;
  };
export function ActionButton({
  mode = "light",
  label,
  leadingIcon,
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
export function IconButton({
  mode = "light",
  label,
  children,
  disabled,
  style,
  ...props
}: Omit<PressableProps, "children"> &
  Themed & { label: string; children: React.ReactNode }) {
  const palette = uiPalette(mode);
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
  badgeLabel: {
    fontSize: uiTokens.type.caption,
    lineHeight: 16,
    fontWeight: "600",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
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
