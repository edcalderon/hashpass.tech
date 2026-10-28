import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { StatusPillProps } from '../types/status-pill.types';

/** `#rrggbb` + 0-255 alpha -> `#rrggbbaa`; non-hex colours pass through. */
const tint = (color: string, alpha: number) => (
  /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha.toString(16).padStart(2, '0')}` : color
);

/**
 * The one status pill: a label and an optional trailing glyph on a soft tint
 * of its colour with a matching contour. Speaker status and every agenda card
 * badge (session type, "On agenda", "Past") render through it so they stay
 * identical. The label keeps the neutral text colour so any hue stays legible.
 */
export default function StatusPill({
  label,
  color,
  isDark = false,
  trailingIcon,
  onPress,
  accessibilityLabel,
  pillTestID,
  style,
}: StatusPillProps) {
  const palette = uiPalette(isDark ? 'dark' : 'light');
  const pillStyle = [
    styles.pill,
    { backgroundColor: tint(color, isDark ? 0x2e : 0x1a), borderColor: tint(color, isDark ? 0x80 : 0x66) },
    style,
  ];
  const content = (
    <>
      <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>{label}</Text>
      {trailingIcon}
    </>
  );

  if (!onPress) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={pillStyle} testID={pillTestID}>
        {content}
      </View>
    );
  }
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      onPress={onPress}
      style={pillStyle}
      testID={pillTestID}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: uiTokens.space.xs + 2,
    paddingHorizontal: uiTokens.space.md - 2,
    paddingVertical: uiTokens.space.xs + 2,
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    maxWidth: '100%',
  },
  label: { flexShrink: 1, fontSize: uiTokens.type.caption, fontWeight: '700', letterSpacing: 0.3 },
});
