import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { CalendarDays, Globe2, KeyRound, MonitorSmartphone, QrCode, RefreshCcw, ShieldCheck, UsersRound } from 'lucide-react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';

const icons = {
  'shield-checkmark': ShieldCheck,
  key: KeyRound,
  sync: RefreshCcw,
  'qr-code-outline': QrCode,
  'people-outline': UsersRound,
  'calendar-days': CalendarDays,
  'globe-2': Globe2,
  'monitor-smartphone': MonitorSmartphone,
} as const;

export interface FeatureIconProps {
  name: string;
  color: string;
  compact?: boolean;
  /** Native plays a short acknowledgement when the icon enters or becomes active. */
  active?: boolean;
  entranceDelay?: number;
  visible?: boolean;
  reduceMotion?: boolean;
}

/** One SVG icon family and circular artwork frame on web, iOS and Android. */
export default function FeatureIcon({ name, color, compact = false, active = false, entranceDelay = 0, visible = true, reduceMotion = false }: FeatureIconProps) {
  const Icon = icons[name as keyof typeof icons] ?? ShieldCheck;
  const size = compact ? uiTokens.space.xxl : uiTokens.space.hero;
  const frameRef = useRef<View>(null);
  const { animationLevel } = useAnimationLevel();
  // Fail static until the OS preference is known; the artwork is always visible.
  const [systemReduced, setSystemReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [inViewport, setInViewport] = useState(false);
  const progress = useSharedValue(0);

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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined' || !frameRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInViewport(entry.isIntersecting && entry.intersectionRatio >= 0.4);
    }, { threshold: [0, 0.4] });
    observer.observe(frameRef.current as unknown as Element);
    return () => observer.disconnect();
  }, []);

  const animate = animationLevel === 'full' && !reduceMotion && !systemReduced
    && foreground && visible && (Platform.OS === 'web' ? inViewport : active);
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (animate) {
      // Finite, not an ambient loop: replay on entry/open, and cancel on exit,
      // background or a motion preference change.
      const entrance = withTiming(1, { duration: uiTokens.motion.entrance, easing: Easing.inOut(Easing.cubic) });
      progress.value = entranceDelay > 0 ? withDelay(entranceDelay, entrance) : entrance;
    }
    return () => cancelAnimation(progress);
  }, [animate, entranceDelay, progress]);

  const glyphStyle = useAnimatedStyle(() => {
    const pulse = Math.sin(progress.value * Math.PI);
    const entryProgress = animate ? progress.value : 1;
    const rotate = Platform.OS === 'web' && name === 'sync'
      ? `${progress.value * 180}deg`
      : `${Platform.OS === 'web' && name === 'key' ? pulse * -12 : 0}deg`;
    return {
      opacity: animate ? 0.9 + entryProgress * 0.1 : 1,
      transform: [
        { translateY: animate ? (1 - entryProgress) * 3 - pulse : -pulse * 2 },
        { scale: animate ? 0.94 + entryProgress * 0.06 : 1 },
        { rotate },
      ],
    };
  }, [animate, name, progress]);
  const detailStyle = useAnimatedStyle(() => ({
    opacity: Math.sin(progress.value * Math.PI) * 0.8,
    transform: [{ translateY: name === 'qr-code-outline' ? (progress.value - 0.5) * size / 2 : 0 }],
  }), [name, progress, size]);

  return (
    <View
      ref={frameRef}
      testID={`feature-icon-${name}`}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, { width: size, height: size, borderColor: `${color}66`, backgroundColor: `${color}12`, pointerEvents: "none" }]}
    >
      <Animated.View style={glyphStyle}>
        <Icon size={compact ? uiTokens.space.lg : uiTokens.space.xxl} color={color} strokeWidth={1.6} />
      </Animated.View>
      <Animated.View style={[
        name === 'qr-code-outline' ? styles.scan : styles.signal,
        { backgroundColor: color },
        detailStyle,
      ]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: uiTokens.radius.circle,
    borderWidth: uiTokens.control.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  scan: {
    position: 'absolute',
    width: '62%',
    height: uiTokens.control.borderWidth,
  },
  signal: {
    position: 'absolute',
    bottom: uiTokens.space.sm,
    right: uiTokens.space.sm,
    width: uiTokens.space.xs,
    height: uiTokens.space.xs,
    borderRadius: uiTokens.radius.circle,
  },
});
