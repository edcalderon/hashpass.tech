import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { LukasCaptcha } from '../LukasCaptcha';
import type { LukasClaimModalProps, LukasClaimSession, LukasClaimStep } from '../../types/lukas.types';

const API_BASE = 'https://api.hashpass.tech/api';

export function LukasClaimModal({ visible, onClose }: LukasClaimModalProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const styles = useMemo(() => getStyles(isDark, isMobile), [isDark, isMobile]);
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={reset}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Pressable onPress={reset} accessibilityRole="button" accessibilityLabel="Close claim dialog" style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
            <Text style={styles.eyebrow}>10 LUKAS UNLOCKED</Text>
            <Text style={styles.title}>{step === 'verified' ? 'Email verified' : 'Claim securely'}</Text>
            {step === 'email' ? <>
              <Text style={styles.copy}>Verify your email to continue into HashPass wallet setup. A one-time code protects the claim.</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={isDark ? '#718096' : '#94A3B8'} style={styles.input} />
              <LukasCaptcha resetKey={captchaResetKey} onSolve={setCaptchaToken} onReset={() => setCaptchaToken('')} />
              <Pressable disabled={busy || !captchaToken} onPress={requestCode} style={[styles.primary, (!captchaToken || busy) && styles.disabled]}>{busy ? <ActivityIndicator color="#07111F" /> : <Text style={styles.primaryText}>Send verification code</Text>}</Pressable>
            </> : null}
            {step === 'code' ? <>
              <Text style={styles.copy}>Enter the six-digit code sent to {email.trim().toLowerCase()}.</Text>
              <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={isDark ? '#718096' : '#94A3B8'} style={[styles.input, styles.codeInput]} />
              <Pressable disabled={busy} onPress={verifyCode} style={styles.primary}>{busy ? <ActivityIndicator color="#07111F" /> : <Text style={styles.primaryText}>Verify email</Text>}</Pressable>
            </> : null}
            {step === 'verified' ? <>
              <Text style={styles.copy}>Your email is verified. Continue in HashPass to create or secure your compatible wallet. Seed phrases and private keys stay local and are never emailed.</Text>
              <Pressable onPress={openWallet} style={styles.primary}><Text style={styles.primaryText}>Open HashPass wallet</Text></Pressable>
              <Text style={styles.note}>For your protection, HashPass will never send a seed phrase or private key in email or ZIP attachments.</Text>
            </> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 23, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 500, maxHeight: '90%', borderRadius: 24, backgroundColor: isDark ? '#101B2B' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2D4059' : '#E2E8F0', overflow: 'hidden' },
  content: { padding: isMobile ? 24 : 32, gap: 16 },
  close: { position: 'absolute', right: 14, top: 10, zIndex: 2, padding: 6 },
  closeText: { color: isDark ? '#D5DFEC' : '#64748B', fontSize: 28, lineHeight: 28 },
  eyebrow: { color: '#35C66B', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: isMobile ? 26 : 32, fontWeight: '800', paddingRight: 28 },
  copy: { color: isDark ? '#A8B6C8' : '#526174', fontSize: 15, lineHeight: 22 },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#425A73' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A', paddingHorizontal: 16, fontSize: 16 },
  codeInput: { letterSpacing: 8, textAlign: 'center', fontWeight: '800' },
  primary: { minHeight: 52, borderRadius: 999, backgroundColor: '#35C66B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryText: { color: '#07111F', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.45 },
  error: { color: '#FCA5A5', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  note: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
