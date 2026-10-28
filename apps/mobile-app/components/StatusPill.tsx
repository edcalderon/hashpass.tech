import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMotionAllowed } from '../hooks/useMotionAllowed';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { StatusPillProps } from '../types/status-pill.types';

const DOT = 8;

/** Status dot; a live dot emits a soft ping ring unless motion is reduced. */
function StatusDot({ color, live }: { color: string; live: boolean }) {
  const motionAllowed = useMotionAllowed();
  const ping = useRef(new Animated.Value(0)).current;
  const pinging = live && motionAllowed;
  useEffect(() => {
    if (!pinging) {
      ping.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(ping, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pinging, ping]);
  return (
    <View style={styles.dotSlot} accessible={false} importantForAccessibility="no-hide-descendants">
      {pinging ? (
        <Animated.View
          style={[styles.dotRing, {
            backgroundColor: color,
            opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
          }]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

/**
 * The one status pill: dot, label and an optional trailing glyph on a raised
 * surface with a hairline border. Speaker status and every agenda card badge
 * (session type, "On agenda", "Past") render through it so they stay identical.
 */
export default function StatusPill({
  label,
  color,
  isDark = false,
  live = false,
  trailingIcon,
  onPress,
  accessibilityLabel,
  pillTestID,
  style,
}: StatusPillProps) {
  const palette = uiPalette(isDark ? 'dark' : 'light');
  const pillStyle = [styles.pill, { backgroundColor: palette.raised, borderColor: palette.border }, style];
  const content = (
    <>
      <StatusDot color={color} live={live} />
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
    gap: uiTokens.space.sm,
    paddingHorizontal: uiTokens.space.md,
    paddingVertical: uiTokens.space.xs + 2,
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
    maxWidth: '100%',
  },
  label: { flexShrink: 1, fontSize: uiTokens.type.caption, fontWeight: '600', letterSpacing: 0.2 },
  dotSlot: { width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: uiTokens.radius.circle },
  dotRing: { position: 'absolute', width: DOT, height: DOT, borderRadius: uiTokens.radius.circle },
});
