import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type LayoutAnimationConfig,
  type PressableProps,
  type TextProps,
  type TextInputProps,
  type ViewStyle,
  type ViewProps,
} from "react-native";
import { uiPalette, uiTokens, type ColorMode } from "./tokens";
import type { ControlSkin, SegmentedTab } from "./primitives.types";
type Themed = { mode?: ColorMode };

// Android needs this opt-in once per process before LayoutAnimation calls
// have any effect; iOS and web ignore it. This used to run eagerly at
// module scope, but reading `Platform.OS` (and `UIManager`) at import time
// throws under several of this repo's hand-rolled per-test react-native
// mocks that only partially shape the module -- some omit `UIManager`,
// others omit `Platform` entirely -- which crashed every consumer of this
// file under Jest before any component even rendered. Running it lazily,
// the first time an IconButton actually animates, means it only ever runs
// against whatever Platform/UIManager shape is in use at that point; the
// try/catch keeps a still-incomplete test mock from taking down a real
// render even then.
let androidLayoutAnimationEnabled = false;
function ensureAndroidLayoutAnimationEnabled() {
  if (androidLayoutAnimationEnabled) return;
  androidLayoutAnimationEnabled = true;
  try {
    if (Platform.OS === "android" && UIManager?.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  } catch {
    // Best-effort opt-in only; never let this block a real render.
  }
}

// Built lazily inside animateExpandChange (not as a module-scope constant)
// because RN's jest preset mocks LayoutAnimation without its `Types`/
// `Properties` statics -- reading them at import time throws
// "Cannot read properties of undefined (reading 'Types')" for every consumer
// of this module under test, before any component even renders.
function buildRevealLayoutAnimation(): LayoutAnimationConfig {
  return {
    duration: uiTokens.motion.fast,
    update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY },
    create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  };
}
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
  onPress,
  accessibilityLabel,
}: React.PropsWithChildren<
  Themed & {
    tone?: "accent" | "neutral" | "onMedia";
    radius?: number;
    markerColor?: string;
    leadingIcon?: React.ReactNode;
    compact?: boolean;
    onPress?: PressableProps["onPress"];
    accessibilityLabel?: string;
  }
>) {
  const palette = uiPalette(mode);
  const onMedia = tone === "onMedia";
  const interactive = typeof onPress === "function";
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const active = interactive && (hovered || focused || pressed);
  const backgroundColor = active
    ? palette.accent
    : onMedia
      ? "#111114e6"
      : tone === "accent"
        ? palette.accentSoft
        : palette.surface;
  const borderColor = active
    ? palette.accent
    : onMedia
      ? "#ffffff40"
      : palette.border;
  const textColor = active
    ? palette.onAccent
    : onMedia
      ? "#ffffff"
      : tone === "accent"
        ? palette.accent
        : palette.muted;
  const content = (
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
          { color: textColor },
        ]}
      >
        {children}
      </Text>
    </View>
  );
  const style = [
    styles.badge,
    compact && styles.badgeCompact,
    radius === undefined ? undefined : { borderRadius: radius },
    { backgroundColor, borderColor },
  ];
  if (!interactive) {
    return <View style={style}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={style}
    >
      {content}
    </Pressable>
  );
}
export type ActionButtonProps = Omit<PressableProps, "children"> &
  Themed & {
    label: string;
    /** Limit the visible label without changing the accessible name. */
    labelNumberOfLines?: number;
    /** Optional native/web tooltip for a truncated visible label. */
    tooltipText?: string;
    leadingIcon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
    variant?: "primary" | "secondary" | "ghost";
    loading?: boolean;
    /** Brand colours for a product skin; geometry and states stay shared. */
    skin?: ControlSkin;
  };
export function ActionButton({
  mode = "light",
  label,
  labelNumberOfLines,
  tooltipText,
  leadingIcon,
  trailingIcon,
  variant = "primary",
  loading = false,
  skin,
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  ...props
}: ActionButtonProps) {
  const palette = uiPalette(mode);
  const blocked = disabled || loading;
  const fill = skin?.fill ?? palette.accentFill;
  const soft = skin?.soft ?? palette.accentSoft;
  const border = skin?.border ?? palette.border;
  const foreground = variant === "primary" ? (skin?.onFill ?? palette.onAccent) : (skin?.accent ?? palette.accent);
  const tooltipProps = tooltipText ? ({ title: tooltipText } as Record<string, string>) : {};
  return (
    <Pressable
      {...props}
      {...tooltipProps}
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
              ? fill
              : variant === "secondary"
                ? soft
                : "transparent",
          borderColor:
            variant === "ghost"
              ? "transparent"
              : variant === "primary"
                ? fill
                : border,
        },
        typeof style === "function" ? style(state) : style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : leadingIcon && <View accessible={false} pointerEvents="none">{leadingIcon}</View>}
      <Text numberOfLines={labelNumberOfLines} ellipsizeMode="tail" style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
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
export type { ControlSkin, SegmentedTab } from "./primitives.types";

/**
 * The one tab control: a rounded pill track with a filled selected segment,
 * as used by Wallet and Notifications. Use it whenever a view switches
 * between sibling sections; do not hand-roll tab rows.
 */
export function SegmentedTabs<T extends string = string>({
  mode = "light",
  tabs,
  value,
  onChange,
  accentColor,
  surfaceColor,
  fullWidth = false,
  accessibilityLabel,
}: Themed & {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Selected segment fill; defaults to the palette accent. */
  accentColor?: string;
  /** Track fill; defaults to the palette surface. */
  surfaceColor?: string;
  /** Stretch the track and share the width equally between segments. */
  fullWidth?: boolean;
  accessibilityLabel?: string;
}) {
  const palette = uiPalette(mode);
  const accent = accentColor || palette.accent;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.segmentTrack,
        { backgroundColor: surfaceColor || palette.surface },
        fullWidth ? styles.segmentTrackFull : null,
      ]}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.segment,
              fullWidth ? styles.segmentFull : null,
              selected ? { backgroundColor: accent } : null,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentLabel, { color: selected ? palette.onAccent : palette.muted }]}
            >
              {tab.label}
            </Text>
            {tab.trailingIcon ? <View accessible={false} pointerEvents="none">{tab.trailingIcon}</View> : null}
            {tab.count ? (
              <View
                style={[
                  styles.segmentCount,
                  { backgroundColor: selected ? palette.onAccent : "#FF3B30" },
                ]}
              >
                <Text style={[styles.segmentCountText, { color: selected ? accent : "#FFFFFF" }]}>
                  {tab.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
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
    /** Keeps the compact button's surface and border while its label expands. */
    preserveBaseStyleOnReveal?: boolean;
    loading?: boolean;
    loadingLabel?: string;
    /** Reveal buttons only: square edge in px, to line up with neighbouring pills. */
    size?: number;
  };

export function IconButton({
  mode = "light",
  label,
  children,
  disabled,
  style,
  revealLabel = false,
  accentColor,
  preserveBaseStyleOnReveal = false,
  loading = false,
  loadingLabel,
  size,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...props
}: IconButtonProps) {
  const edge = size ?? uiTokens.control.compactHeight;
  const palette = uiPalette(mode);
  const color = accentColor || palette.accent;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const expanded = revealLabel && (hovered || focused);
  // Retracting immediately on the first onHoverOut/onBlur is jarring when the
  // pointer only grazes past the control -- give it one beat to settle
  // before collapsing back, same debounce the agenda action icons used to
  // hand-roll for themselves before this became the shared implementation.
  const hoverOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverOutTimeout = () => {
    if (hoverOutTimeoutRef.current) {
      clearTimeout(hoverOutTimeoutRef.current);
      hoverOutTimeoutRef.current = null;
    }
  };

  const animateExpandChange = () => {
    // LayoutAnimation is what actually makes the width/opacity change
    // animate smoothly on native -- without it, the expand/retract is an
    // instant snap on Android/iOS (the CSS transition below only covers
    // web). Android needs setLayoutAnimationEnabledExperimental, flipped
    // once lazily on first use (see ensureAndroidLayoutAnimationEnabled).
    try {
      if (Platform.OS !== "web" && !reduceMotion) {
        ensureAndroidLayoutAnimationEnabled();
        LayoutAnimation.configureNext(buildRevealLayoutAnimation());
      }
    } catch {
      // A test harness's partial react-native mock (missing Platform,
      // LayoutAnimation, etc.) should never crash a real interaction --
      // worst case the expand/retract just isn't animated that time.
    }
  };

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

  useEffect(() => clearHoverOutTimeout, []);

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
    // The visible pill may be compact (`size`), but the Pressable keeps at
    // least the compact touch target so a 30px pill is still easy to tap.
    const visualWidth = expanded ? edge + 104 : edge;
    return (
        <Pressable
          {...props}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ ...props.accessibilityState, disabled: !!disabled, expanded, busy: loading }}
          disabled={disabled || loading}
          onBlur={(event) => {
            // Don't clear the pending hover-out timeout here -- a focused
            // web button that receives onHoverOut and then loses focus
            // before the debounce expires (e.g. the user clicks elsewhere)
            // has only that timeout to clear hovered=false; clearing it
            // from onBlur leaves hovered=true with no scheduled reset,
            // and every revealLabel button stays expanded until the next
            // hover cycle. Let the timeout finish naturally so both
            // states collapse together.
            animateExpandChange();
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={(event) => {
            clearHoverOutTimeout();
            animateExpandChange();
            setFocused(true);
            onFocus?.(event);
          }}
          onHoverIn={(event) => {
            clearHoverOutTimeout();
            animateExpandChange();
            setHovered(true);
            onHoverIn?.(event);
          }}
          onHoverOut={(event) => {
            clearHoverOutTimeout();
            hoverOutTimeoutRef.current = setTimeout(() => {
              animateExpandChange();
              setHovered(false);
              hoverOutTimeoutRef.current = null;
            }, uiTokens.motion.fast);
            onHoverOut?.(event);
          }}
          style={(state) => [
            styles.revealIconButtonPressable,
            {
              height: Math.max(edge, uiTokens.control.compactHeight),
              width: Math.max(visualWidth, uiTokens.control.compactHeight),
              opacity: state.pressed ? 0.72 : 1,
            },
            typeof style === "function" ? style(state) : style,
          ]}
        >
          <View
            accessible={false}
            pointerEvents="none"
            style={[
              styles.revealIconButton,
              {
                height: edge,
                width: visualWidth,
                backgroundColor:
                  expanded && !preserveBaseStyleOnReveal ? `${color}14` : palette.surface,
                borderColor:
                  expanded && !preserveBaseStyleOnReveal ? `${color}52` : palette.border,
              },
              transitionStyle,
            ]}
          >
            <View style={[styles.revealIcon, { height: edge, width: edge }]}>{content}</View>
            {expanded ? (
              <View style={[styles.revealLabelClip, transitionStyle]}>
                <Text numberOfLines={1} style={[styles.revealLabel, { color }]}>{loading && loadingLabel ? loadingLabel : label}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
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
/**
 * Text with full-content tooltip on hover/long-press when truncated.
 * Detects truncation via onTextLayout and only shows the affordance when needed.
 * Mobile-first: web uses title attribute for native tooltip, native uses long-press.
 *
 * React Native Web's Text implementation never fires `onTextLayout` and
 * silently strips an unsupported `title` prop (neither is in its forwarded
 * props allowlist), so the web path can't rely on either -- truncation is
 * instead measured from the rendered DOM node via `ref`, and the tooltip is
 * applied by mutating that node's `title` attribute directly. Native keeps
 * the `onTextLayout` line-count check and reveals the full text via
 * `onLongPress`, which React Native's Text supports natively without needing
 * a wrapping Pressable.
 */
export type HoverTextProps = TextProps & {
  mode?: ColorMode;
  /** Maximum lines before truncation. If omitted, text is not truncated. */
  numberOfLines?: number;
  /** Optional custom tooltip text (defaults to children). */
  tooltipText?: string;
};

export function HoverText({
  mode = "light",
  numberOfLines,
  tooltipText,
  style,
  children,
  onTextLayout: onTextLayoutProp,
  ...props
}: HoverTextProps) {
  const [isTruncated, setIsTruncated] = useState(false);
  const textRef = useRef<Text>(null);

  const handleTextLayout = (event: any) => {
    // Forward to caller's handler if they supplied one
    onTextLayoutProp?.(event);
    if (numberOfLines === undefined) return;
    const { lines } = event.nativeEvent;
    // If we have more lines than numberOfLines, text is truncated
    setIsTruncated(lines.length > numberOfLines);
  };

  const fullText = tooltipText || (typeof children === "string" ? children : "");

  useEffect(() => {
    if (Platform.OS !== "web" || numberOfLines === undefined) return;
    const node = textRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.getBoundingClientRect !== "function") return;
    const measure = () => {
      const truncated =
        numberOfLines === 1
          ? node.scrollWidth > node.clientWidth
          : node.scrollHeight > node.clientHeight;
      setIsTruncated(truncated);
      if (truncated && fullText) {
        node.setAttribute("title", fullText);
      } else {
        node.removeAttribute("title");
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fullText, numberOfLines, children]);

  return (
    <Text
      {...props}
      ref={textRef}
      numberOfLines={numberOfLines}
      onTextLayout={handleTextLayout}
      // Native: long-press reveals the full text since there is no hover
      // state; Text supports onLongPress directly there. React Native Web
      // drops unrecognized handlers like this one, so it's a no-op on web.
      onLongPress={
        Platform.OS !== "web" && isTruncated && fullText
          ? () => Alert.alert("", fullText)
          : undefined
      }
      style={style}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  segmentTrack: {
    alignSelf: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 5,
    borderRadius: uiTokens.radius.pill,
  },
  segmentTrackFull: { alignSelf: "stretch", flexWrap: "nowrap" },
  segment: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    minHeight: uiTokens.control.compactHeight,
    paddingHorizontal: 18,
    borderRadius: uiTokens.radius.pill,
  },
  segmentFull: { flex: 1, paddingHorizontal: 8 },
  segmentLabel: { fontSize: uiTokens.type.label, fontWeight: "600" },
  segmentCount: {
    alignItems: "center",
    borderRadius: uiTokens.radius.pill,
    marginLeft: 6,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  segmentCountText: { fontSize: 11, fontWeight: "600" },
  revealIconButton: {
    alignItems: "center",
    flexDirection: "row",
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    height: uiTokens.control.compactHeight,
    overflow: "hidden",
  },
  revealIconButtonPressable: {
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: uiTokens.space.md * 2,
    paddingHorizontal: uiTokens.space.sm - uiTokens.space.xs / 2,
    paddingVertical: uiTokens.space.xs / 4,
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
    fontSize: uiTokens.type.caption - 1,
    lineHeight: uiTokens.type.caption + 2,
    letterSpacing: 0.2,
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
