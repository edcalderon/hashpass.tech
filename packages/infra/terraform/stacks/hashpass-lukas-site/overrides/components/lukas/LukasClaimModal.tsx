import React, { useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text } from 'react-native';
import { FormField } from '@hashpass/ui/primitives';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { LukasCaptcha } from '../LukasCaptcha';
import { ActionButton } from '@hashpass/ui/primitives';
import { LukasDialog, LukasEyebrow, dialogCopy, dialogTitle, lukasFullWidth, lukasPalette, lukasSkin } from './lukas-ui';
import type { LukasClaimModalProps, LukasClaimSession, LukasClaimStep } from '../../types/lukas.types';

const API_BASE = 'https://api.hashpass.tech/api';

export function LukasClaimModal({ visible, onClose, rewardTotal = 0, onClaimed }: LukasClaimModalProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const palette = useMemo(() => lukasPalette(isDark), [isDark]);
  const mode = isDark ? 'dark' : 'light';
  const skin = useMemo(() => lukasSkin(palette), [palette]);
  const styles = useMemo(() => getStyles(isMobile, palette), [isMobile, palette]);
  const [step, setStep] = useState<LukasClaimStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [sessionPayload, setSessionPayload] = useState<LukasClaimSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('email');
    setEmail('');
    setCode('');
    setCaptchaToken('');
    setSessionPayload(null);
    setError('');
    onClose();
  };

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!captchaToken) {
      setError('Complete the security check first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/lukas/claim/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, captchaToken }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'We could not send the code.');
      setStep('code');
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : 'We could not send the code.');
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'That code is invalid or expired.');
      if (!payload?.session?.access_token || !payload?.session?.refresh_token) {
        throw new Error('Email verified, but the wallet session could not be created. Please try again.');
      }
      setSessionPayload(payload.session);
      onClaimed?.(email.trim().toLowerCase());
      setStep('verified');
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'That code is invalid or expired.');
    } finally {
      setBusy(false);
    }
  };

  const openWallet = () => {
    if (!sessionPayload) return;
    const fragment = new URLSearchParams({
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token,
      expires_in: String(sessionPayload.expires_in ?? 3600),
      token_type: sessionPayload.token_type ?? 'bearer',
      type: 'magiclink',
    });
    // Tokens stay in the URL fragment so they are not sent in HTTP requests;
    // the HashPass callback consumes them and removes the fragment immediately.
    const url = `https://hashpass.tech/auth/callback?returnTo=${encodeURIComponent('/dashboard/wallet')}#${fragment.toString()}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    else void Linking.openURL(url);
  };

  return (
    <LukasDialog visible={visible} onClose={reset} isDark={isDark} isMobile={isMobile} palette={palette} closeLabel="Close claim dialog">
      <LukasEyebrow palette={palette}>{rewardTotal} LUKAS EARNED · TGE RESERVED</LukasEyebrow>
      <Text style={styles.title}>{step === 'verified' ? 'Email verified' : 'Claim securely'}</Text>
      {step === 'email' ? <>
        <Text style={styles.copy}>Verify your email to continue into HashPass wallet setup. A one-time code protects the claim.</Text>
        <FormField mode={mode} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
        <LukasCaptcha resetKey={captchaResetKey} onSolve={setCaptchaToken} onReset={() => setCaptchaToken('')} />
        <ActionButton mode={mode} skin={skin} label="Send verification code" loading={busy} disabled={!captchaToken} onPress={requestCode} style={lukasFullWidth} />
      </> : null}
      {step === 'code' ? <>
        <Text style={styles.copy}>Enter the six-digit code sent to {email.trim().toLowerCase()}.</Text>
        <FormField mode={mode} label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" placeholder="000000" style={styles.codeInput} />
        <ActionButton mode={mode} skin={skin} label="Verify email" loading={busy} onPress={verifyCode} style={lukasFullWidth} />
      </> : null}
      {step === 'verified' ? <>
        <Text style={styles.copy}>Your email is verified and your LUKAS progress is reserved for the TGE event. Continue in HashPass to create or secure your compatible wallet. Seed phrases and private keys stay local and are never emailed.</Text>
        <ActionButton mode={mode} skin={skin} label="Open HashPass wallet" onPress={openWallet} style={lukasFullWidth} />
        <Text style={styles.note}>For your protection, HashPass will never send a seed phrase or private key in email or ZIP attachments.</Text>
      </> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </LukasDialog>
  );
}

const getStyles = (isMobile: boolean, palette: ReturnType<typeof lukasPalette>) => StyleSheet.create({
  title: dialogTitle(palette, isMobile),
  copy: dialogCopy(palette),
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '800' },
  note: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  error: { color: palette.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
