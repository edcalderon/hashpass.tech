import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyRound, QrCode, RefreshCcw, ShieldCheck, UsersRound } from 'lucide-react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';

const icons = {
  'shield-checkmark': ShieldCheck,
  key: KeyRound,
  sync: RefreshCcw,
  'qr-code-outline': QrCode,
  'people-outline': UsersRound,
} as const;

export interface FeatureIconProps {
  name: string;
  color: string;
  compact?: boolean;
  /** Native plays one short acknowledgement when the card is opened. */
  active?: boolean;
  visible?: boolean;
  reduceMotion?: boolean;
}

/** One SVG icon family and circular artwork frame on web, iOS and Android. */
export default function FeatureIcon({ name, color, compact = false, active = false, visible = true, reduceMotion = false }: FeatureIconProps) {
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
      // Finite, not an ambient loop: replay only on entry/open, and cancel on
      // exit, background or a preference change. Native only translates/fades.
      progress.value = withTiming(1, { duration: uiTokens.motion.entrance * 2, easing: Easing.inOut(Easing.cubic) });
    }
    return () => cancelAnimation(progress);
  }, [animate, progress]);

  const glyphStyle = useAnimatedStyle(() => {
    const pulse = Math.sin(progress.value * Math.PI);
    const rotate = Platform.OS === 'web' && name === 'sync'
      ? `${progress.value * 180}deg`
      : `${Platform.OS === 'web' && name === 'key' ? pulse * -12 : 0}deg`;
    return { opacity: 1 - pulse * 0.12, transform: [{ translateY: -pulse * 2 }, { rotate }] };
  }, [name, progress]);
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
      pointerEvents="none"
      style={[styles.frame, { width: size, height: size, borderColor: `${color}66`, backgroundColor: `${color}12` }]}
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
