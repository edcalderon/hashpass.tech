import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';

// The chevron from assets/logo-hashpass.svg (path data copied verbatim, in
// the source file's own un-translated coordinate space) -- just the glyph,
// not the logo's own static ring. The full brand mark pairs that chevron
// with a ring baked into the SVG itself; stacking that on top of this
// component's own animated ring produced two same-color concentric circles
// that read as redundant rather than as one identity, so the mark is
// deliberately split here: this component supplies the only ring, the logo
// contributes only its inner symbol.
// CHEVRON_VIEWBOX is a tight square crop around the glyph's real bounding
// box (getBBox: x 128.07-173.04, y 68.50-125.39) plus ~14% padding, so it
// fills the space inside the spinner ring instead of sitting in the middle
// of a mostly-empty 104x104 box built for the full mark.
const CHEVRON_VIEWBOX = '114.12 60.51 72.89 72.89';
const CHEVRON_MARK_D =
  'm 128.19996,120.73001 c -0.22496,-5.4 -0.0853,-8.199 0.43432,-8.70611 0.35566,-0.34707 2.03368,-1.31956 6.05295,-3.50796 1.0914,-0.59424 4.00843,-2.21781 6.48229,-3.60792 2.47385,-1.39011 6.60973,-3.6904 9.19083,-5.111736 2.58111,-1.42135 4.65508,-2.70242 4.60884,-2.84681 -0.0735,-0.2296 -1.5975,-1.12688 -6.9205,-4.07463 -0.72761,-0.40292 -3.04933,-1.69516 -5.15938,-2.87162 -4.61041,-2.57055 -6.19163,-3.44095 -10.81147,-5.95134 -2.42075,-1.31542 -3.60948,-2.11425 -3.77031,-2.53366 -0.26131,-0.68143 -0.32768,-11.93466 -0.0743,-12.59499 0.0883,-0.23018 0.31178,-0.41851 0.49656,-0.41851 0.18477,0 2.76164,1.41189 5.72638,3.13754 2.96473,1.72565 10.56964,6.14651 16.8998,9.82412 6.33015,3.67761 13.05719,7.58629 14.94896,8.68594 5.03516,2.92686 5.67582,3.40371 6.23881,4.64352 0.89385,1.96842 0.55373,4.5103 -0.78539,5.869626 -0.60453,0.61365 -17.49191,10.51134 -18.6622,10.93791 -0.15674,0.0571 -0.58263,0.30685 -0.94643,0.55494 -0.3638,0.24808 -1.3163,0.8115 -2.11667,1.25202 -0.80036,0.44053 -5.02709,2.85004 -9.39271,5.35445 -9.28663,5.32744 -11.63504,6.62534 -11.98784,6.62534 -0.15102,0 -0.33908,-1.93657 -0.45255,-4.66012 z';

const HASHPASS_LOADER_RING_COLOR = '#0fe5f0';
const MARK_CHEVRON_COLOR = '#cf0f17';

export interface HashpassLoaderProps {
  /** Overall footprint in px; the chevron itself renders at ~68% of this. */
  size?: number;
  /** Ring accent color. Defaults to the logo's own cyan so the ring reads as
   * an extension of the mark rather than an unrelated theme color. */
  color?: string;
  /** Lets a caller freeze the spin (e.g. a hidden/inactive screen). */
  active?: boolean;
}

/**
 * The HASHPASS chevron glyph paired with a rotating accent ring -- the
 * app's one shared branded loader. Used wherever LoadingScreen falls back
 * to a plain spinner (no `icon` prop given), so every generic loading state
 * gets it automatically.
 *
 * Motion follows the same accessible pattern as FeatureIcon: gated by
 * AnimationLevelContext, the OS reduce-motion setting, and app foreground
 * state. When motion isn't allowed the ring still renders, just frozen --
 * it reads as a deliberate open-ring frame around the logo rather than a
 * stuck spinner.
 */
export default function HashpassLoader({ size = 64, color = HASHPASS_LOADER_RING_COLOR, active = true }: HashpassLoaderProps) {
  const { animationLevel } = useAnimationLevel();
  // Fail static until the OS preference is known, same as FeatureIcon.
  const [systemReduced, setSystemReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const rotation = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !preferenceChanged) setSystemReduced(value);
    }).catch(() => {});
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      setSystemReduced(value);
    });
    const app = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted = false; preference.remove(); app.remove(); };
  }, []);

  const spin = active && animationLevel !== 'none' && !systemReduced && foreground;

  useEffect(() => {
    cancelAnimation(rotation);
    if (spin) {
      // Ambient loop (unlike FeatureIcon's finite entrance animation) --
      // this is a loading indicator, it needs to keep moving for as long as
      // it's on screen. 'reduced' still spins, just slower, rather than
      // freezing outright -- only the OS setting or animationLevel 'none'
      // does that.
      rotation.value = withRepeat(
        withTiming(360, { duration: animationLevel === 'reduced' ? 2200 : 1300, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      rotation.value = 0;
    }
    return () => cancelAnimation(rotation);
  }, [spin, animationLevel, rotation]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }), [rotation]);

  const strokeWidth = Math.max(2.5, size * 0.045);
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  // ~72% of the circle drawn, the rest left open -- reads as "in motion"
  // even frozen, instead of a plain closed ring.
  const dash = circumference * 0.72;
  // Larger than the old full-mark crop (0.6) since the tight chevron-only
  // viewBox has no built-in ring eating into the available space.
  const markSize = size * 0.68;

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, ringStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            fill="none"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
      <View style={styles.center} pointerEvents="none">
        <Svg width={markSize} height={markSize} viewBox={CHEVRON_VIEWBOX}>
          <Path d={CHEVRON_MARK_D} fill={MARK_CHEVRON_COLOR} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
