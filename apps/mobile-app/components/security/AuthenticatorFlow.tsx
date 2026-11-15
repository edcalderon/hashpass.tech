import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ActionButton, FormField, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { authenticatorStatus, beginAuthenticator, verifyAuthenticator } from '../../lib/authenticator-client';
import { beginAuthenticatorChallenge, rememberAuthenticator } from '../../lib/authenticator-session';
import type { AuthenticatorEnrollment, AuthenticatorFlowProps, AuthenticatorResult } from '../../types/authenticator.types';

/** Secrets, codes and recovery material stay in this mounted wizard only. */
export default function AuthenticatorFlow({ scope, onDone, pinProof }: AuthenticatorFlowProps) {
  const { dbUserId } = useAuth();
  const { isDark } = useTheme();
  const { t } = useTranslation('pin');
  const mode = isDark ? 'dark' : 'light', palette = uiPalette(mode);
  const [phase, setPhase] = useState<'checking' | 'enroll' | 'verify' | 'backup' | 'error'>('checking');
  const [enrollment, setEnrollment] = useState<AuthenticatorEnrollment | null>(null);
  const [result, setResult] = useState<AuthenticatorResult | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => beginAuthenticatorChallenge(), []);
  useEffect(() => {
    const mine = ++generation.current;
    setEnrollment(null); setResult(null); setCode(''); setError(null); setPhase('checking');
    void authenticatorStatus().then(async status => {
      if (mine !== generation.current) return;
      if (status.enabled) { setPhase('verify'); return; }
      if (!pinProof) throw new Error('pin_required');
      const next = await beginAuthenticator(pinProof);
      if (mine === generation.current) { setEnrollment(next); setPhase('enroll'); }
    }).catch(() => { if (mine === generation.current) setPhase('error'); });
    return () => { generation.current += 1; };
  }, [dbUserId, pinProof, retry]);
  const finish = (value: AuthenticatorResult) => {
    if (!dbUserId) return;
    rememberAuthenticator(dbUserId, scope, value.proof);
    setResult(null); setEnrollment(null); setCode(''); onDone();
  };
  const submit = async () => {
    if (inFlight.current || !dbUserId) return;
    inFlight.current = true; setBusy(true); setError(null);
    const mine = generation.current, entered = code.replace(/[\s-]/g, '').toLowerCase();
    setCode('');
    try {
      const next = await verifyAuthenticator(entered, scope, phase === 'enroll', pinProof);
      if (mine !== generation.current) return;
      if (next.recoveryCodes) { setEnrollment(null); setResult(next); setPhase('backup'); }
      else finish(next);
    } catch {
      if (mine === generation.current) setError(t('authenticator.invalid', 'Code not accepted. It may be expired or already used. Wait for a new code. After five failed attempts, wait five minutes.'));
    } finally { inFlight.current = false; if (mine === generation.current) setBusy(false); }
  };
  const body = { color: palette.text, fontSize: uiTokens.type.body };
  return <Surface mode={mode} style={styles.root}>
    <Text accessibilityRole="header" style={[body, { fontSize: uiTokens.type.title }]}>
      {t('authenticator.title', 'Protect Wallet & Contacts')}
    </Text>
    {phase === 'checking' && <Text style={body}>{t('authenticator.checking', 'Checking authenticator protection…')}</Text>}
    {phase === 'error' && <>
      <Text accessibilityRole="alert" style={body}>{t('authenticator.unavailable', 'Authenticator setup is unavailable. Check your connection. If your PIN check expired, go back and enter your PIN again.')}</Text>
      <ActionButton mode={mode} label={t('authenticator.retry', 'Try again')} onPress={() => setRetry(value => value + 1)} />
    </>}
    {phase === 'enroll' && enrollment && <>
      <Text style={body}>{t('authenticator.scan', '1. Open Google Authenticator or Authy and add an account. Scan this QR code, or enter the setup key manually.')}</Text>
      <View accessible accessibilityLabel={t('authenticator.qr', 'Authenticator enrollment QR code')} style={styles.qr}>
        <QRCode value={enrollment.uri} size={192} quietZone={12} />
      </View>
      <Text style={body}>{t('authenticator.key', 'Manual setup key (time-based, 6 digits, 30 seconds)')}</Text>
      <Text selectable style={body}>{enrollment.secret}</Text>
      <Text style={body}>{t('authenticator.confirm', '2. Enter the current code to finish enrollment. Setup expires after 10 minutes. Keep your device time set automatically.')}</Text>
    </>}
    {phase === 'verify' && <Text style={body}>{scope === 'access'
      ? t('authenticator.access', 'Enter your authenticator code to open Wallet & Contacts. Your PIN and authenticator protect every visit.')
      : t('authenticator.critical', 'Confirm this sensitive action with a fresh authenticator code. A code can only be used once.')}</Text>}
    {(phase === 'enroll' || phase === 'verify') && <>
      <FormField mode={mode} label={t('authenticator.code', 'Authenticator code or recovery code')}
        value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} maxLength={24}
        secureTextEntry={false} editable={!busy} onSubmitEditing={() => { void submit(); }} />
      {error && <Text accessibilityRole="alert" style={body}>{error}</Text>}
      <ActionButton mode={mode} label={t('authenticator.verify', 'Verify code')} loading={busy}
        disabled={!/^(\d{6}|[a-f0-9]{16})$/.test(code.replace(/[\s-]/g, '').toLowerCase())}
        onPress={() => { void submit(); }} />
    </>}
    {phase === 'backup' && result && <>
      <Text style={body}>{t('authenticator.backup', '3. Save these recovery codes somewhere private. Each code works once if you lose access to your authenticator. They will not be shown again.')}</Text>
      <Text selectable style={body}>{result.recoveryCodes?.join('\n')}</Text>
      <ActionButton mode={mode} label={t('authenticator.saved', 'I saved my recovery codes')} onPress={() => {
        // Backup can take longer than the proof lifetime. Verify a new code if it expired.
        if (Date.parse(result.proof.expiresAt) > Date.now() + 5000) finish(result);
        else { setResult(null); setPhase('verify'); }
      }} />
    </>}
  </Surface>;
}
const styles = StyleSheet.create({
  root: { gap: uiTokens.space.lg, width: '100%' },
  qr: { alignItems: 'center', padding: uiTokens.space.md },
});
