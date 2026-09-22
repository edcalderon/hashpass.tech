import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { Pause, Play, SkipBack } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';

// Fixed dimensions — every tick gets the SAME container width so the pill
// never shifts or reflows as active state or progress changes.
const TICK_W = 20;
const TICK_INACTIVE_DOT_W = 6;
const TICK_H = 4;
const TICK_GAP = 4;
const PLAY_BTN_SIZE = 22;

interface CarouselTickPillProps {
  count: number;
  /** Logical active slide index (0-based, non-cloned). */
  activeIndex: { value: number };
  /** Auto-play progress 0→1 within the current slide's interval. */
  progress: { value: number };
  /** Whether auto-play is currently running. */
  isPlaying: boolean;
  onTogglePlay?: () => void;
  onIndexPress?: (index: number) => void;
  /** Jump back to the first slide. */
  onRestart?: () => void;
}

/** Single tick with fixed-width container — progress fills the active bar, zero layout drift. */
function TickMark({
  i,
  active,
  progress,
  isDark,
  onPress,
}: {
  i: number;
  active: { value: number };
  progress: { value: number };
  isDark: boolean;
  onPress: () => void;
}) {
  const isActive = useDerivedValue(() => Math.abs(i - active.value) < 0.5);

  // Inactive dot: centered small pill inside the fixed-width track
  const inactiveStyle = useAnimatedStyle(() => ({
    width: isActive.value ? 0 : TICK_INACTIVE_DOT_W,
    opacity: isActive.value ? 0 : 1,
  }), []);

  // Active tick: full-width pill
  const activeTickStyle = useAnimatedStyle(() => ({
    opacity: isActive.value ? 1 : 0,
    backgroundColor: isDark ? '#FFFFFF' : '#000000',
  }), [isDark]);

  // Progress fill: lighter overlay that grows inside the active tick
  const fillStyle = useAnimatedStyle(() => {
    if (!isActive.value) return { opacity: 0 };
    const p = Math.max(0, Math.min(1, progress.value));
    return {
      opacity: 1,
      width: TICK_W * p,
      backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
    };
  }, [isDark]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.hit}
    >
      <View style={styles.track}>
        {/* Inactive dot */}
        <Animated.View style={[styles.inactive, inactiveStyle]} />
        {/* Active tick bar */}
        <Animated.View style={[styles.activeTick, activeTickStyle]} />
        {/* Progress fill overlay */}
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
    </TouchableOpacity>
  );
}

export default function CarouselTickPill({
  count,
  activeIndex,
  progress,
  isPlaying,
  onTogglePlay,
  onIndexPress,
  onRestart,
}: CarouselTickPillProps) {
  const { isDark } = useTheme();
  const active = useDerivedValue(() => Math.round(activeIndex.value));
  const ticks = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  return (
    <View
      style={[
        styles.pill,
        // No background — the translucent pill frame looked too similar to the
        // card UI behind it. The tick marks and icons are enough to read.
      ]}
    >
      <TouchableOpacity
        onPress={onTogglePlay}
        activeOpacity={0.6}
        style={styles.playBtn}
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        accessibilityRole="button"
      >
        {isPlaying ? (
          <Pause size={12} color={isDark ? '#FFFFFF' : '#000000'} />
        ) : (
          <Play size={12} color={isDark ? '#FFFFFF' : '#000000'} fill={isDark ? '#FFFFFF' : '#000000'} />
        )}
      </TouchableOpacity>
      <View style={styles.divider} />
      {ticks.map((i) => (
        <TickMark
          key={i}
          i={i}
          active={active}
          progress={progress}
          isDark={isDark}
          onPress={() => onIndexPress?.(i)}
        />
      ))}
      {/* Restart button: jump back to the first slide */}
      <TouchableOpacity
        onPress={onRestart}
        activeOpacity={0.6}
        style={styles.restartBtn}
        accessibilityLabel="Restart carousel"
        accessibilityRole="button"
      >
        <SkipBack size={12} color={isDark ? '#FFFFFF' : '#000000'} fill={isDark ? '#FFFFFF' : '#000000'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: TICK_GAP,
  },
  playBtn: {
    width: PLAY_BTN_SIZE,
    height: PLAY_BTN_SIZE,
    borderRadius: PLAY_BTN_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  hit: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    width: TICK_W,
    height: TICK_H,
    borderRadius: TICK_H / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  inactive: {
    height: TICK_H,
    borderRadius: TICK_H / 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
  },
  activeTick: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TICK_W,
    height: TICK_H,
    borderRadius: TICK_H / 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: TICK_H,
    borderRadius: TICK_H / 2,
  },
  restartBtn: {
    width: PLAY_BTN_SIZE,
    height: PLAY_BTN_SIZE,
    borderRadius: PLAY_BTN_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
