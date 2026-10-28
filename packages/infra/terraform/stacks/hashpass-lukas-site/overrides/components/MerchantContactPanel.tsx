import React, { useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton, FilterChip, FormField, Surface } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
import { useIsMobile } from '../hooks/useIsMobile';
import { LukasCaptcha } from './LukasCaptcha';

const API_BASE = 'https://api.hashpass.tech/api';
const BOOKING_URL = 'https://calendar.app.google/vYsTa9GpamSVccAt9';
const MERCHANT_TYPES = ['Coffee shop', 'Events & conferences', 'Coworking', 'Restaurant or retail', 'Other'];

export function MerchantContactPanel() {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const mode = isDark ? 'dark' : 'light';
  const styles = useMemo(() => getStyles(isDark, isMobile), [isDark, isMobile]);
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [merchantType, setMerchantType] = useState(MERCHANT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [bookingPreference, setBookingPreference] = useState('Book a call');
  const [captchaToken, setCaptchaToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!contactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !description.trim()) {
      setError('Add your name, a valid email, and a short description.');
      return;
    }
    if (!captchaToken) {
      setError('Complete the security check before sending.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/lukas/merchant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactName, email, merchantType, description, bookingPreference, captchaToken }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'The merchant request could not be sent.');
      setSent(true);
      setCaptchaToken('');
      setResetKey((key) => key + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The merchant request could not be sent.');
      setCaptchaToken('');
      setResetKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>FOR MERCHANTS</Text>
        <Text style={styles.title}>Bring LUKAS to your counter.</Text>
        <Text style={styles.description}>Tell us where you operate and how you want to use the LatAm index. We will reply from contact@hashpass.tech.</Text>
      </View>
      {sent ? (
        <Surface mode={mode} style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Request sent</Text>
          <Text style={styles.successCopy}>We sent a confirmation to {email.trim()}. Prefer a faster conversation?</Text>
          <ActionButton
            mode={mode}
            label="Book directly"
            variant="primary"
            onPress={() => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(BOOKING_URL, '_blank', 'noopener,noreferrer'); else void Linking.openURL(BOOKING_URL); }}
            style={styles.primaryButton}
          />
        </Surface>
      ) : (
        <Surface mode={mode} style={styles.formCard}>
          <FormField mode={mode} label="Your name" value={contactName} onChangeText={setContactName} autoComplete="name" />
          <FormField mode={mode} label="Work email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Text style={styles.fieldLabel}>Merchant type</Text>
          <View style={styles.options}>{MERCHANT_TYPES.map((type) => <FilterChip key={type} mode={mode} label={type} selected={merchantType === type} onPress={() => setMerchantType(type)} style={styles.option} />)}</View>
          <FormField mode={mode} label="What would you like to enable?" value={description} onChangeText={setDescription} multiline numberOfLines={4} style={styles.messageInput} />
          <Text style={styles.fieldLabel}>Follow-up</Text>
          <View style={styles.options}>
            {['Book a call', 'Email me first'].map((preference) => <FilterChip key={preference} mode={mode} label={preference} selected={bookingPreference === preference} onPress={() => setBookingPreference(preference)} style={styles.option} />)}
          </View>
          <LukasCaptcha resetKey={resetKey} onSolve={setCaptchaToken} onReset={() => setCaptchaToken('')} />
          <ActionButton mode={mode} label="Send merchant request" variant="primary" loading={busy} disabled={!captchaToken} onPress={submit} style={styles.primaryButton} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.footnote}>We only use this information to respond to your request. See our privacy policy for details.</Text>
        </Surface>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean) => StyleSheet.create({
  container: { width: '100%', maxWidth: 900, alignSelf: 'center', marginTop: isMobile ? 48 : 72 },
  header: { marginBottom: 22 },
  eyebrow: { color: '#35C66B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 34 : 44, fontWeight: '800', marginTop: 8 },
  description: { color: isDark ? '#A8B6C8' : '#526174', fontSize: 15, lineHeight: 23, marginTop: 10, maxWidth: 680 },
  formCard: { padding: isMobile ? uiTokens.space.lg : uiTokens.space.xxl, borderRadius: uiTokens.radius.card, gap: uiTokens.space.md },
  messageInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: 14 },
  fieldLabel: { color: isDark ? '#C6D1DF' : '#475569', fontSize: uiTokens.type.caption, fontWeight: '800', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm },
  option: { minHeight: uiTokens.control.minHeight, paddingHorizontal: uiTokens.space.lg },
  primaryButton: { width: '100%', backgroundColor: uiTokens.feature.green, borderColor: uiTokens.feature.green, marginTop: uiTokens.space.sm },
  error: { color: '#FCA5A5', fontSize: 13, textAlign: 'center' },
  footnote: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  successCard: { padding: isMobile ? 22 : 32, borderRadius: uiTokens.radius.card, borderColor: isDark ? '#365314' : '#A7F3D0', alignItems: 'center', gap: uiTokens.space.md },
  successIcon: { color: '#35C66B', fontSize: 42, fontWeight: '900' },
  successTitle: { color: isDark ? '#BBF7D0' : '#137A42', fontSize: 24, fontWeight: '800' },
  successCopy: { color: isDark ? '#C6D1DF' : '#526174', textAlign: 'center', lineHeight: 22 },
});
