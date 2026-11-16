import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ActionButton, FormField, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { authenticatorStatus, beginAuthenticator, sendAuthenticatorSetupCode, verifyAuthenticator } from '../../lib/authenticator-client';
import { beginAuthenticatorChallenge, rememberAuthenticator } from '../../lib/authenticator-session';
import type { AuthenticatorFlowPhase } from './types/AuthenticatorFlow.types';
import type { AuthenticatorEnrollment, AuthenticatorFlowProps, AuthenticatorResult, AuthenticatorStatus } from '../../types/authenticator.types';

/** Secrets, codes and recovery material stay in this mounted wizard only. */
export default function AuthenticatorFlow({ scope, onDone, pinProof, onUnenrolled, initialEnabled }: AuthenticatorFlowProps) {
  const { dbUserId } = useAuth();
  const { isDark } = useTheme();
  const { t } = useTranslation('pin');
  const mode = isDark ? 'dark' : 'light', palette = uiPalette(mode);
  const [phase, setPhase] = useState<AuthenticatorFlowPhase>(initialEnabled === true ? 'verify' : 'checking');
  const [enrollment, setEnrollment] = useState<AuthenticatorEnrollment | null>(null);
  const [result, setResult] = useState<AuthenticatorResult | null>(null);
  const [code, setCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => beginAuthenticatorChallenge(), []);
  useEffect(() => {
    const mine = ++generation.current;
    setEnrollment(null); setResult(null); setCode(''); setEmailCode(''); setError(null);
    if (initialEnabled !== undefined) {
      if (initialEnabled) setPhase('verify');
      else if (onUnenrolled) onUnenrolled();
      else setPhase(pinProof ? 'optional' : 'pinRequired');
      return () => { generation.current += 1; };
    }
    setPhase('checking');
    void authenticatorStatus().then((status: AuthenticatorStatus) => {
      if (mine !== generation.current) return;
      if (status.enabled) { setPhase('verify'); return; }
      if (onUnenrolled) { onUnenrolled(); return; }
      if (!pinProof) { setPhase('pinRequired'); return; }
      setPhase('optional');
    }).catch(() => { if (mine === generation.current) setPhase('statusUnavailable'); });
    return () => { generation.current += 1; };
  }, [dbUserId, initialEnabled, onUnenrolled, pinProof, retry]);
  const startEnrollment = async () => {
    if (inFlight.current || !pinProof) return;
    inFlight.current = true; setBusy(true); setError(null);
    const mine = generation.current;
    try {
      const next = await beginAuthenticator(pinProof);
      if (mine !== generation.current) return;
      setEnrollment(next); setPhase('enroll');
      if (next.emailStatus === 'rate_limited') {
        setError(t('authenticator.emailRateLimited', 'A setup email was sent recently. Check your inbox or try again in a minute.'));
      } else if (next.emailStatus === 'unavailable') {
        setError(t('authenticator.emailSendUnavailable', 'Setup is ready, but we could not send the email code. Retry or continue with your PIN.'));
      }
    } catch {
      if (mine === generation.current) setError(t('authenticator.setupUnavailable', 'Could not prepare authenticator setup. Try again in a moment; PIN-only access remains available.'));
    } finally {
      inFlight.current = false;
      if (mine === generation.current) setBusy(false);
    }
  };
  const resendSetupCode = async () => {
    if (inFlight.current || !pinProof || phase !== 'enroll') return;
    inFlight.current = true; setBusy(true); setError(null);
    const mine = generation.current;
    try {
      const challenge = await sendAuthenticatorSetupCode(pinProof);
      if (mine === generation.current) {
        setEnrollment((current) => current ? { ...current, emailHint: challenge.emailHint } : current);
        setEmailCode('');
      }
    } catch (failure) {
      if (mine === generation.current) setError(failure instanceof Error && failure.message === 'rate_limited'
        ? t('authenticator.emailRateLimited', 'A setup email was sent recently. Check your inbox or try again in a minute.')
        : t('authenticator.emailSendUnavailable', 'Setup is ready, but we could not send the email code. Retry or continue with your PIN.'));
    } finally {
      inFlight.current = false;
      if (mine === generation.current) setBusy(false);
    }
  };
  const continueWithPin = () => {
    if (!pinProof || (phase !== 'optional' && phase !== 'enroll')) return;
    setEnrollment(null); setResult(null); setCode(''); onDone('pin');
  };
  const finish = (value: AuthenticatorResult) => {
    if (!dbUserId) return;
    rememberAuthenticator(dbUserId, scope, value.proof);
    setResult(null); setEnrollment(null); setCode(''); onDone('authenticator');
  };
  const submit = async () => {
    if (inFlight.current || !dbUserId) return;
    if (phase === 'enroll' && (!/^\d{6}$/.test(emailCode) || !/^\d{6}$/.test(code))) return;
    if (phase === 'verify' && !/^(\d{6}|[a-f0-9]{16})$/.test(code.replace(/[\s-]/g, '').toLowerCase())) return;
    inFlight.current = true; setBusy(true); setError(null);
    const mine = generation.current, entered = code.replace(/[\s-]/g, '').toLowerCase();
    const emailEntered = emailCode.replace(/[\s-]/g, '');
    setCode(''); setEmailCode('');
    try {
      const enrolling = phase === 'enroll';
      const next = await verifyAuthenticator(entered, scope, enrolling, pinProof, enrolling ? emailEntered : undefined);
      if (mine !== generation.current) return;
      if (next.recoveryCodes) { setEnrollment(null); setResult(next); setPhase('backup'); }
      else finish(next);
    } catch {
      if (mine === generation.current) setError(phase === 'enroll'
        ? t('authenticator.setupCodesInvalid', 'The email or authenticator code was not accepted. Email codes are one-time and expire after 10 minutes; request a new email code and enter a current authenticator code.')
        : t('authenticator.invalid', 'Code not accepted. It may be expired or already used. Wait for a new code. After five failed attempts, wait five minutes.'));
    } finally { inFlight.current = false; if (mine === generation.current) setBusy(false); }
  };
  const body = { color: palette.text, fontSize: uiTokens.type.body };
  if (phase === 'checking') return (
    <View
      style={styles.checking}
      accessibilityRole="progressbar"
      accessibilityLabel={t('authenticator.checking', 'Checking authenticator protection…')}
    >
      <ActivityIndicator size="small" color={palette.accent} />
      <Text style={body}>{t('authenticator.checking', 'Checking authenticator protection…')}</Text>
    </View>
  );
  return <Surface mode={mode} style={styles.root}>
    <Text accessibilityRole="header" style={[body, { fontSize: uiTokens.type.title }]}>
      {t('authenticator.title', 'Protect Wallet & Contacts')}
    </Text>
    {phase === 'optional' && <>
      <View style={styles.recommendation}>
        <Text accessibilityRole="header" style={[body, { fontWeight: '700' }]}>
          {t('authenticator.optionalTitle', 'Authenticator recommended')}
        </Text>
        <Text style={body}>
          {t('authenticator.optionalBody', 'PIN-only access is available. Add an authenticator for stronger security and PIN recovery.')}
        </Text>
      </View>
      <View style={styles.optionalActions}>
        <ActionButton mode={mode} label={t('authenticator.setup', 'Set up authenticator')}
          loading={busy} disabled={busy} onPress={() => { void startEnrollment(); }} />
        <ActionButton mode={mode} variant="secondary" label={t('authenticator.continuePin', 'Continue with PIN')}
          disabled={busy} onPress={continueWithPin} />
      </View>
    </>}
    {phase === 'pinRequired' && <Text accessibilityRole="alert" style={body}>
      {t('authenticator.pinRequired', 'No authenticator is enrolled. A recent PIN check is required to continue with PIN-only access.')}
    </Text>}
    {error && phase === 'optional' && <Text accessibilityRole="alert" style={body}>{error}</Text>}
    {phase === 'statusUnavailable' && <>
      <Text accessibilityRole="alert" style={body}>{t('authenticator.statusUnavailable', 'We could not check whether two-step verification is enabled. Check your connection and try again. Wallet & Contacts stay locked until we can confirm your security status.')}</Text>
      <ActionButton mode={mode} label={t('authenticator.retry', 'Try again')} onPress={() => setRetry(value => value + 1)} />
    </>}
    {phase === 'enroll' && enrollment && <>
      <Text style={body}>{t('authenticator.emailSetup', 'We sent a one-time setup code to {email}. Enter it below. Then scan the QR code with your authenticator app and enter its current code to finish.', { email: enrollment.emailHint || t('authenticator.accountEmail', 'your account email') })}</Text>
      <FormField mode={mode} label={t('authenticator.emailCode', 'Email setup code')}
        value={emailCode} onChangeText={setEmailCode} autoCapitalize="none" autoCorrect={false} maxLength={6}
        secureTextEntry={false} editable={!busy} onSubmitEditing={() => { void submit(); }} />
      <ActionButton mode={mode} variant="secondary" label={t('authenticator.resendEmailCode', 'Resend email code')}
        loading={busy} disabled={busy} onPress={() => { void resendSetupCode(); }} />
      <Text style={body}>{t('authenticator.scan', 'Open Google Authenticator or Authy and add an account. Scan this QR code, or enter the setup key manually.')}</Text>
      <View accessible accessibilityLabel={t('authenticator.qr', 'Authenticator enrollment QR code')} style={styles.qr}>
        <QRCode value={enrollment.uri} size={192} quietZone={12} />
      </View>
      <Text style={body}>{t('authenticator.key', 'Manual setup key (time-based, 6 digits, 30 seconds)')}</Text>
      <Text selectable style={body}>{enrollment.secret}</Text>
      <Text style={body}>{t('authenticator.confirm', 'Enter the current authenticator app code to finish enrollment. Setup expires after 10 minutes. Keep your device time set automatically.')}</Text>
      <ActionButton mode={mode} variant="ghost" label={t('authenticator.continuePin', 'Continue with PIN')}
        disabled={busy} onPress={continueWithPin} />
    </>}
    {phase === 'verify' && <Text style={body}>{scope === 'access'
      ? t('authenticator.access', 'Enter your authenticator code to open Wallet & Contacts. Your PIN and authenticator protect every visit.')
      : t('authenticator.critical', 'Confirm this sensitive action with a fresh authenticator code. A code can only be used once.')}</Text>}
    {(phase === 'enroll' || phase === 'verify') && <>
      <FormField mode={mode} label={phase === 'enroll' ? t('authenticator.code', 'Authenticator app code') : t('authenticator.code', 'Authenticator code or recovery code')}
        value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} maxLength={24}
        secureTextEntry={false} editable={!busy} onSubmitEditing={() => { void submit(); }} />
      {error && <Text accessibilityRole="alert" style={body}>{error}</Text>}
      <ActionButton mode={mode} label={phase === 'enroll' ? t('authenticator.enable', 'Confirm setup') : t('authenticator.verify', 'Verify code')} loading={busy}
        disabled={phase === 'enroll'
          ? !/^\d{6}$/.test(code) || !/^\d{6}$/.test(emailCode)
          : !/^(\d{6}|[a-f0-9]{16})$/.test(code.replace(/[\s-]/g, '').toLowerCase())}
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
  root: { gap: uiTokens.space.md, width: '100%' },
  checking: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: uiTokens.space.sm,
    minHeight: uiTokens.control.minHeight,
  },
  qr: { alignItems: 'center', padding: uiTokens.space.md },
  recommendation: { gap: uiTokens.space.xs },
  optionalActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: uiTokens.space.sm,
  },
});
