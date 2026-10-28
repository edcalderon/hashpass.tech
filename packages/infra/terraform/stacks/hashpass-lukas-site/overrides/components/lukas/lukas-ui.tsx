import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { ModalBackdrop } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import type { LukasButtonProps, LukasCardProps, LukasChipProps, LukasDialogProps, LukasPalette } from '../../types/lukas.types';

export type { LukasPalette };

/**
 * One visual contract for the whole LUKAS landing: geometry comes from the shared
 * `uiTokens`, colour from this Lukas green palette. Screens never hand-roll a
 * button, card, field or dialog silhouette.
 */
export const lukasPalette = (isDark: boolean): LukasPalette => isDark
  ? { fill: '#36C66B', onFill: '#062414', accent: '#7EE6A0', text: '#F5FFFA', body: '#BED2C6', muted: '#8EA89A', card: 'rgba(7, 28, 42, 0.72)', cardRaised: '#101B2B', border: 'rgba(139, 224, 176, 0.24)', borderStrong: '#4B6B5C', tint: 'rgba(54, 198, 107, 0.12)', danger: '#FF8A80', glow: 'rgba(54, 198, 107, 0.4)', canvas: '#06111E' }
  : { fill: '#36C66B', onFill: '#062414', accent: '#087A4A', text: '#10271C', body: '#425D4D', muted: '#5E7567', card: '#F7FCF9', cardRaised: '#FFFFFF', border: '#D7EADF', borderStrong: '#9DBBA9', tint: 'rgba(54, 198, 107, 0.12)', danger: '#B42318', glow: 'rgba(27, 188, 94, 0.28)', canvas: '#F7FAF8' };

export const LUKAS_MAX_WIDTH = 1200;
export const lukasSectionTitle = (palette: LukasPalette, isMobile: boolean): TextStyle => ({
  fontSize: isMobile ? uiTokens.type.heading : 44,
  lineHeight: isMobile ? 38 : 52,
  fontWeight: '800',
  letterSpacing: -0.5,
  color: palette.text,
  textAlign: 'center',
});


export function LukasButton({ label, palette, variant = 'primary', loading = false, fullWidth = false, disabled, leadingIcon, style, accessibilityLabel, ...props }: LukasButtonProps) {
  const blocked = disabled || loading;
  const color = variant === 'primary' ? palette.onFill : variant === 'secondary' ? palette.text : palette.accent;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={(state) => [
        buttonStyles.base,
        fullWidth && buttonStyles.full,
        variant === 'primary' && { backgroundColor: palette.fill, borderColor: palette.fill, shadowColor: palette.fill, shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
        variant === 'secondary' && { backgroundColor: palette.tint, borderColor: palette.borderStrong },
        variant === 'ghost' && { backgroundColor: 'transparent', borderColor: 'transparent' },
        { opacity: blocked ? 0.45 : state.pressed ? 0.78 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={color} /> : leadingIcon}
      <Text style={[buttonStyles.label, { color }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  base: { minHeight: uiTokens.control.minHeight, borderRadius: uiTokens.radius.pill, borderWidth: uiTokens.control.borderWidth, paddingHorizontal: uiTokens.space.xl, paddingVertical: uiTokens.space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: uiTokens.space.sm },
  full: { alignSelf: 'stretch' },
  label: { fontSize: uiTokens.type.body, fontWeight: '800', textAlign: 'center' },
});

/** `compact` (16px) is for rows nested in a section; the default (24px) is a standalone card. */
export function LukasCard({ palette, compact = false, raised = false, style, children }: LukasCardProps) {
  return (
    <View style={[{ backgroundColor: raised ? palette.cardRaised : palette.card, borderColor: palette.border, borderWidth: uiTokens.control.borderWidth, borderRadius: compact ? uiTokens.radius.media : uiTokens.radius.card, padding: compact ? uiTokens.space.lg : uiTokens.space.xl }, style]}>
      {children}
    </View>
  );
}

export function LukasEyebrow({ palette, children, style }: { palette: LukasPalette; children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ color: palette.accent, fontSize: uiTokens.type.caption, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' }, style]}>{children}</Text>;
}

/** Shared modal: translucent blurred scrim, opaque 24px card, scrollable and keyboard-safe. */
export function LukasDialog({ visible, onClose, isDark, isMobile, palette, closeLabel = 'Close', children }: LukasDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalBackdrop mode={isDark ? 'dark' : 'light'}>
        <View style={[dialogStyles.card, { backgroundColor: palette.cardRaised, borderColor: palette.border }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={[dialogStyles.content, { padding: isMobile ? uiTokens.space.xl : uiTokens.space.xxl }]} keyboardShouldPersistTaps="handled">
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} style={[dialogStyles.close, { borderColor: palette.border }]}>
              <Text style={[dialogStyles.closeText, { color: palette.body }]}>×</Text>
            </Pressable>
            {children}
          </ScrollView>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

export const dialogTitle = (palette: LukasPalette, isMobile: boolean): TextStyle => ({ color: palette.text, fontSize: isMobile ? 26 : uiTokens.type.heading, lineHeight: isMobile ? 32 : 38, fontWeight: '800', paddingRight: 44 });
export const dialogCopy = (palette: LukasPalette): TextStyle => ({ color: palette.body, fontSize: uiTokens.type.body, lineHeight: 24 });

const dialogStyles = StyleSheet.create({
  card: { width: '100%', maxWidth: 500, maxHeight: '90%', borderRadius: uiTokens.radius.card, borderWidth: uiTokens.control.borderWidth, overflow: 'hidden' },
  content: { gap: uiTokens.space.lg },
  close: { position: 'absolute', right: 0, top: 0, zIndex: 2, width: uiTokens.control.compactHeight, height: uiTokens.control.compactHeight, borderRadius: uiTokens.radius.pill, borderWidth: uiTokens.control.borderWidth, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 26, lineHeight: 28 },
});

/** Pill choice (compact 44px) for filters, languages and option groups. */
export function LukasChip({ label, palette, selected = false, trailing, style, accessibilityLabel, ...props }: LukasChipProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
      style={(state) => [chipStyles.base, { borderColor: selected ? palette.fill : palette.border, backgroundColor: selected ? palette.tint : 'transparent', opacity: state.pressed ? 0.78 : 1 }, style]}
    >
      <Text style={[chipStyles.label, { color: selected ? palette.accent : palette.body }]}>{label}</Text>
      {selected ? <Text style={[chipStyles.label, { color: palette.accent }]}>{trailing ?? '✓'}</Text> : null}
    </Pressable>
  );
}
const chipStyles = StyleSheet.create({
  base: { minHeight: uiTokens.control.compactHeight, borderRadius: uiTokens.radius.pill, borderWidth: uiTokens.control.borderWidth, paddingHorizontal: uiTokens.space.lg, paddingVertical: uiTokens.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: uiTokens.space.sm },
  label: { fontSize: uiTokens.type.label, fontWeight: '700' },
});
