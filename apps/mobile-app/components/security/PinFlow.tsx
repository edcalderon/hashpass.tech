import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionButton } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTranslation } from '../../i18n/i18n';
import type { PinProblem, UsePin } from '../../hooks/usePin';
import type { StepUpScope } from '../../lib/step-up-session';
import PinPad from './PinPad';
import type { PinFlowProps, Translate } from './types/PinFlow.types';

export type { PinFlowProps };

/** Plain-language text for what went wrong. Never says which digit was wrong, only how many tries remain. */
export function describePinProblem(problem: PinProblem | null, t: Translate, now = Date.now()): string | null {
  if (!problem) return null;
  switch (problem.kind) {
    case 'wrong': return t('wrong', 'That PIN is not right. {count} tries left.', { count: problem.remainingAttempts });
    case 'locked': {
      const seconds = Math.max(1, Math.ceil((Date.parse(problem.lockedUntil) - now) / 1000));
      return t('locked', 'Too many tries. Wait {seconds} seconds, then try again.', { seconds });
    }
    case 'not_set': return t('notSet', 'No PIN is set yet. Create one to continue.');
    case 'already_set': return t('alreadySet', 'A PIN already exists. Enter it to continue.');
    default: return t('unavailable', 'We could not check your PIN. Check your connection and try again.');
  }
}

/**
 * Create-or-unlock, as one flow. A new PIN is entered twice, saved, and used straight away to
 * mint the proof for `scope`, so the person is never asked for a PIN they just chose.
 * The digits exist only in this closure while those requests run.
 */
export default function PinFlow({ mode, pin, scope, intent, onDone, onCancel }: PinFlowProps) {
  const { t } = useTranslation('pin');
  const [creating, setCreating] = useState(intent === 'create');
  const [first, setFirst] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const { problem, clearProblem } = pin;
  const lockedUntil = problem?.kind === 'locked' ? Date.parse(problem.lockedUntil) : null;
  const locked = lockedUntil !== null && lockedUntil > Date.now();

  // The server is the authority on whether a PIN exists.
  useEffect(() => {
    if (problem?.kind === 'not_set' && !creating) { setCreating(true); setFirst(null); }
    else if (problem?.kind === 'already_set' && creating) { setCreating(false); setFirst(null); clearProblem(); }
  }, [problem, creating, clearProblem]);

  // A lockout lifts by itself; clear the message when it does.
  useEffect(() => {
    if (lockedUntil === null) return undefined;
    const timer = setTimeout(clearProblem, Math.max(0, lockedUntil - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [lockedUntil, clearProblem]);

  const submit = useCallback((entered: string) => {
    setMismatch(false);
    if (!creating) { void pin.unlock(entered, scope).then(ok => { if (ok) onDone(); }); return; }
    if (first === null) { clearProblem(); setFirst(entered); return; }
    if (first !== entered) { setFirst(null); setMismatch(true); return; }
    setFirst(null);
    void pin.setPin(entered).then(async saved => {
      if (saved && await pin.unlock(entered, scope)) onDone();
    });
  }, [creating, first, pin, scope, onDone, clearProblem]);

  const confirming = creating && first !== null;
  const title = !creating ? t('enterTitle', 'Enter your PIN')
    : confirming ? t('confirmTitle', 'Confirm your PIN') : t('createTitle', 'Create a 4-digit PIN');
  const hint = !creating ? t('enterHint', 'Your PIN confirms it is really you.')
    : confirming ? t('confirmHint', 'Enter the same four digits again.')
      : t('createHint', 'This second step protects your wallet and contacts. HASHPASS cannot reset it for you.');
  const error = mismatch ? t('mismatch', 'The two PINs did not match. Start again.') : describePinProblem(problem, t);

  return (
    <View style={styles.root}>
      <PinPad mode={mode} title={title} hint={hint} error={error} busy={pin.busy} disabled={locked} onComplete={submit} />
      {onCancel && <ActionButton mode={mode} variant="ghost" label={t('cancel', 'Not now')} disabled={pin.busy} onPress={onCancel} />}
    </View>
  );
}

const styles = StyleSheet.create({ root: { alignItems: 'center', gap: uiTokens.space.lg, width: '100%' } });
