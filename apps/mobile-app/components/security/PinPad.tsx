import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { ColorMode } from '@hashpass/ui/tokens';
import { useTranslation } from '../../i18n/i18n';
import { hapticLight } from '../../lib/haptics';
import { PIN_LENGTH } from '../../lib/setup';
import type { PinKeyAction, PinPadProps } from './types/PinPad.types';

export type { PinKeyAction, PinPadProps };

/** Maps a hardware key (web) to a pad action, so a keyboard behaves exactly like the keypad. */
export function pinKeyAction(key: string): PinKeyAction {
  if (/^[0-9]$/.test(key)) return { type: 'digit', digit: key };
  if (key === 'Backspace' || key === 'Delete') return { type: 'delete' };
  return null;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * Four-digit entry. The digits live only in this component's state and are cleared the
 * moment the fourth one lands, so nothing retains a PIN after it has been handed to
 * `onComplete`. No motion is used, so there is nothing to tone down for reduced motion.
 */
export default function PinPad({ mode, title, hint, error, busy = false, disabled = false, onComplete }: PinPadProps) {
  const { t } = useTranslation('pin');
  const palette = uiPalette(mode);
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const [digits, setDigits] = useState('');
  const blocked = busy || disabled;

  const press = useCallback((digit: string) => {
    if (blocked) return;
    hapticLight();
    setDigits(current => {
      const next = current + digit;
      if (next.length < PIN_LENGTH) return next;
      // Hand over outside the state updater so React can safely re-run it.
      queueMicrotask(() => onComplete(next));
      return '';
    });
  }, [blocked, onComplete]);
  const erase = useCallback(() => { if (!blocked) { hapticLight(); setDigits(current => current.slice(0, -1)); } }, [blocked]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const action = pinKeyAction(event.key);
      if (!action) return;
      event.preventDefault();
      if (action.type === 'digit') press(action.digit); else erase();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [press, erase]);

  const key = (label: string, onPress: () => void, accessibilityLabel = label) => (
    <Pressable key={accessibilityLabel} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: blocked }}
      disabled={blocked} onPress={onPress} style={({ pressed }) => [styles.key, { opacity: blocked ? 0.45 : pressed ? 0.75 : 1 }]}>
      <Text style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
      <View accessible accessibilityLabel={t('progress', '{count} of {total} digits entered', { count: digits.length, total: PIN_LENGTH })} style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <View key={index} style={[styles.dot, index < digits.length && { backgroundColor: palette.accentFill, borderColor: palette.accentFill }]} />
        ))}
      </View>
      <View style={styles.status} accessibilityLiveRegion="polite">
        {busy ? <ActivityIndicator size="small" color={palette.accent} />
          : !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
      <View accessibilityLabel={t('keypad', 'PIN keypad')} style={styles.grid}>
        {KEYS.map(digit => key(digit, () => press(digit)))}
        <View style={styles.spacer} />
        {key('0', () => press('0'))}
        {key('⌫', erase, t('delete', 'Delete last digit'))}
      </View>
    </View>
  );
}

const makeStyles = (mode: ColorMode) => {
  const p = uiPalette(mode);
  return StyleSheet.create({
    root: { alignItems: 'center', gap: uiTokens.space.lg, width: '100%', maxWidth: 320, alignSelf: 'center' },
    title: { color: p.text, fontSize: uiTokens.type.title, fontWeight: '700', textAlign: 'center' },
    hint: { color: p.muted, fontSize: uiTokens.type.label, lineHeight: 22, textAlign: 'center' },
    dots: { flexDirection: 'row', gap: uiTokens.space.lg, paddingVertical: uiTokens.space.sm },
    dot: { width: 16, height: 16, borderRadius: uiTokens.radius.circle, borderWidth: 2, borderColor: p.border },
    status: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    error: { color: p.danger, fontSize: uiTokens.type.label, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: uiTokens.space.md, justifyContent: 'center' },
    key: { width: '30%', flexGrow: 1, minHeight: uiTokens.control.minHeight + uiTokens.space.md, alignItems: 'center', justifyContent: 'center', borderRadius: uiTokens.radius.card, backgroundColor: p.raised, borderWidth: uiTokens.control.borderWidth, borderColor: p.border },
    spacer: { width: '30%', flexGrow: 1 },
    keyLabel: { color: p.text, fontSize: uiTokens.type.title, fontWeight: '600' },
  });
};
