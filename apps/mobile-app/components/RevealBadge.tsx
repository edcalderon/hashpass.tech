import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { animateRevealChange } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { useMotionAllowed } from '../hooks/useMotionAllowed';
import { mixHex } from '../lib/color-mix';
import type { RevealBadgeProps } from '../types/reveal-badge.types';

const SIZE = 28;
/** Space around the label inside the expanded pill (icon is already part of SIZE). */
const LABEL_PADDING = uiTokens.space.md;
/** Generous per-character estimate used for the first open, before the label has been measured. */
const CHARACTER_WIDTH = 10;
const NATIVE_HOLD_MS = 2200;

/**
 * Icon-only badge that opens into its label on hover or keyboard focus (web) and on tap
 * (native, where there is no hover; it closes itself after a moment). Collapsed it takes
 * the room of one small circle, so the title beside it keeps its width. Expanded it grows
 * towards the start of the row over an opaque tint, never pushing the neighbours around.
 */
export default function RevealBadge({
  label,
  color,
  isDark = false,
  icon,
  surfaceColor,
  textColor,
  testID,
}: RevealBadgeProps) {
  const motionAllowed = useMotionAllowed();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [labelWidth, setLabelWidth] = useState<number | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = hovered || focused || tapped;

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  const change = useCallback((apply: () => void) => {
    animateRevealChange(motionAllowed);
    apply();
  }, [motionAllowed]);

  const onPress = useCallback(() => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    change(() => setTapped(true));
    tapTimer.current = setTimeout(() => change(() => setTapped(false)), NATIVE_HOLD_MS);
  }, [change]);

  // The label keeps its natural width (flexShrink 0); once measured, the pill fits it exactly.
  const textWidth = labelWidth ?? label.length * CHARACTER_WIDTH;
  const width = expanded ? SIZE + textWidth + LABEL_PADDING : SIZE;
  const transition = Platform.OS === 'web' && motionAllowed
    ? ({
        transitionDuration: `${uiTokens.motion.fast}ms`,
        transitionProperty: 'width',
        transitionTimingFunction: 'ease-out',
      } as object)
    : null;

  return (
    <View style={styles.slot}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        onPress={onPress}
        onHoverIn={() => change(() => setHovered(true))}
        onHoverOut={() => change(() => setHovered(false))}
        onFocus={() => change(() => setFocused(true))}
        onBlur={() => change(() => setFocused(false))}
        style={[
          styles.pill,
          {
            width,
            backgroundColor: mixHex(color, surfaceColor, isDark ? 0.18 : 0.1),
            borderColor: mixHex(color, surfaceColor, isDark ? 0.5 : 0.4),
          },
          transition,
        ]}
      >
        {expanded ? (
          <Text
            numberOfLines={1}
            onLayout={(event) => setLabelWidth(Math.ceil(event.nativeEvent.layout.width))}
            style={[styles.label, { color: textColor }]}
          >
            {label}
          </Text>
        ) : null}
        <View style={styles.icon}>{icon}</View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Reserves the collapsed footprint; the pill is absolutely placed so it can overlap the title.
  slot: { height: SIZE, width: SIZE },
  pill: {
    alignItems: 'center',
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    flexDirection: 'row',
    height: SIZE,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 5,
  },
  icon: { alignItems: 'center', height: SIZE - 2, justifyContent: 'center', width: SIZE - 2 },
  label: {
    flexShrink: 0,
    fontSize: uiTokens.type.caption,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingLeft: uiTokens.space.md,
    paddingRight: uiTokens.space.xs,
  },
});
