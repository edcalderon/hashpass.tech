import { uiTokens } from '@hashpass/ui/tokens';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useAnimations } from '../../providers/AnimationProvider';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeColors } from '../../lib/theme';
import type { DrawerSheetProps } from './DrawerSheet.types';
export type { DrawerSheetProps } from './DrawerSheet.types';

const ENTRANCE_MS = 220;

export default function DrawerSheet({
  open, onClose, title, closeLabel = 'Close', expandLabel = 'Expand', shrinkLabel = 'Shrink',
  defaultHeight = 'content', children,
}: DrawerSheetProps) {
  const { colors } = useTheme();
  // Respect both motion preferences (AGENTS.md): the app-level "disable animations" setting
  // and the system reduced-motion flag, including changes while the sheet is open.
  const { animationsEnabled } = useAnimations();
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  useEffect(() => {
    let active = true;
    // A missing answer is treated as reduced motion (the safe default is no movement).
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(reduced => { if (active) setSystemReducedMotion(reduced); })
      .catch(() => { if (active) setSystemReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const motionOk = animationsEnabled && !systemReducedMotion;
  const [fullHeight, setFullHeight] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  // A fresh open always starts as the standard sheet; expanded mode is per-session state.
  useEffect(() => {
    if (!open) {
      setFullHeight(false);
      fade.setValue(0);
      slide.setValue(0);
      return;
    }
    // Reduced motion: the sheet appears at its visible endpoints at once — no fade, no slide.
    if (!motionOk) {
      fade.setValue(1);
      slide.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: ENTRANCE_MS, useNativeDriver: false }),
      Animated.timing(slide, { toValue: 1, duration: ENTRANCE_MS, useNativeDriver: false }),
    ]).start();
  }, [open, motionOk, fade, slide]);
  const styles = getStyles(colors);
  const backdrop = Platform.OS === 'web'
    ? [styles.backdrop, { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as ViewStyle]
    : styles.backdrop;
  return <Modal visible={open} transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
    <View style={styles.root}>
      {/* The dim/blur layer fades in and absolutely fills the modal: the area above the
          panel is always dimmed, and a tap anywhere on it closes the sheet. */}
      <Animated.View style={[styles.backdropLayer, backdrop, { opacity: fade }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose}
          style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View style={[styles.panelWrap, {
        opacity: fade,
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [260, 0] }) }],
      }]}>
        <View style={[styles.panel, defaultHeight === 'medium' && styles.panelMedium, fullHeight && styles.panelFull]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: fullHeight }}
            accessibilityLabel={fullHeight ? shrinkLabel : expandLabel}
            onPress={() => setFullHeight(value => !value)} style={styles.grabArea}>
            <View style={styles.grabber} />
          </Pressable>
          {title !== undefined && <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>}
          {/* With a fixed medium height the ScrollView must fill the remaining panel so it
              scrolls rather than sizing to its content inside an oversized sheet. */}
          <ScrollView style={[styles.body, defaultHeight === 'medium' && styles.bodyFill]}
            contentContainerStyle={styles.bodyContent}>{children}</ScrollView>
        </View>
      </Animated.View>
    </View>
  </Modal>;
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdropLayer: { ...StyleSheet.absoluteFillObject },
  backdrop: { backgroundColor: uiTokens.effects.mediaVenueScrim },
  // Fills the root (definite height) so the panel's percentage heights resolve reliably;
  // content anchors to the bottom and box-none lets taps above the panel reach the backdrop.
  panelWrap: { flex: 1, justifyContent: 'flex-end' },
  panel: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background.paper,
    borderColor: colors.divider, borderWidth: 1, borderBottomWidth: 0, gap: 12,
    // Bottom inset: compact on web, taller on native for the home-indicator area. This is
    // the sheet's only trailing space — the old 24pt panel padding + 8pt content padding
    // stacked into the visible dead band under the content.
    paddingBottom: Platform.OS === 'web' ? 16 : 24 },
  panelMedium: { height: '60%', maxHeight: '85%' },
  panelFull: { height: '96%', maxHeight: '96%' },
  // Grab area: 40pt tall (standard touch target) with a 36×5 pill; no text, no chevron —
  // the sheet's own slide animation communicates the expanded state.
  grabArea: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingTop: 10, paddingBottom: 2 },
  grabber: { width: 36, height: 5, borderRadius: uiTokens.radius.pill, backgroundColor: colors.divider },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: uiTokens.space.lg, gap: 12 },
  title: { color: colors.text.primary, fontSize: 22, fontWeight: '700', flexShrink: 1 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: uiTokens.radius.circle,
    borderWidth: 1, borderColor: colors.divider },
  closeIcon: { color: colors.text.primary, fontSize: 22, fontWeight: '700' },
  body: { paddingHorizontal: uiTokens.space.lg },
  bodyFill: { flex: 1 },
  bodyContent: { gap: 12, paddingBottom: 8 },
});
