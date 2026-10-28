import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useIsMobile } from '../hooks/useIsMobile';
import { LukasCaptcha } from './LukasCaptcha';

const API_BASE = 'https://api.hashpass.tech/api';
const BOOKING_URL = 'https://calendar.app.google/vYsTa9GpamSVccAt9';
const MERCHANT_TYPES = ['Coffee shop', 'Events & conferences', 'Coworking', 'Restaurant or retail', 'Other'];

export function MerchantContactPanel() {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
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
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Request sent</Text>
          <Text style={styles.successCopy}>We sent a confirmation to {email.trim()}. Prefer a faster conversation?</Text>
          <Pressable onPress={() => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(BOOKING_URL, '_blank', 'noopener,noreferrer'); else void Linking.openURL(BOOKING_URL); }} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Book directly</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.formCard}>
          <TextInput value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor={styles.placeholder.color} style={styles.input} />
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Work email" placeholderTextColor={styles.placeholder.color} style={styles.input} />
          <Text style={styles.fieldLabel}>Merchant type</Text>
          <View style={styles.options}>{MERCHANT_TYPES.map((type) => <Pressable key={type} onPress={() => setMerchantType(type)} style={[styles.option, merchantType === type && styles.optionSelected]}><Text style={[styles.optionText, merchantType === type && styles.optionTextSelected]}>{type}</Text></Pressable>)}</View>
          <TextInput value={description} onChangeText={setDescription} multiline numberOfLines={4} placeholder="What would you like to enable?" placeholderTextColor={styles.placeholder.color} style={[styles.input, styles.messageInput]} />
          <Text style={styles.fieldLabel}>Follow-up</Text>
          <View style={styles.options}>
            {['Book a call', 'Email me first'].map((preference) => <Pressable key={preference} onPress={() => setBookingPreference(preference)} style={[styles.option, bookingPreference === preference && styles.optionSelected]}><Text style={[styles.optionText, bookingPreference === preference && styles.optionTextSelected]}>{preference}</Text></Pressable>)}
          </View>
          <LukasCaptcha resetKey={resetKey} onSolve={setCaptchaToken} onReset={() => setCaptchaToken('')} />
          <Pressable disabled={busy || !captchaToken} onPress={submit} style={[styles.primaryButton, (!captchaToken || busy) && styles.disabled]}>{busy ? <ActivityIndicator color="#07111F" /> : <Text style={styles.primaryButtonText}>Send merchant request</Text>}</Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.footnote}>We only use this information to respond to your request. See our privacy policy for details.</Text>
        </View>
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
  formCard: { padding: isMobile ? 18 : 26, borderRadius: 22, borderWidth: 1, borderColor: isDark ? '#2D4059' : '#D7E0EA', backgroundColor: isDark ? 'rgba(16, 27, 43, 0.72)' : '#FFFFFF', gap: 12 },
  input: { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#425A73' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A', paddingHorizontal: 14, fontSize: 15 },
  messageInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: 14 },
  placeholder: { color: isDark ? '#718096' : '#94A3B8' },
  fieldLabel: { color: isDark ? '#C6D1DF' : '#475569', fontSize: 12, fontWeight: '800', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: isDark ? '#425A73' : '#CBD5E1', paddingHorizontal: 12, justifyContent: 'center' },
  optionSelected: { borderColor: '#35C66B', backgroundColor: isDark ? 'rgba(53,198,107,0.18)' : 'rgba(53,198,107,0.10)' },
  optionText: { color: isDark ? '#C6D1DF' : '#475569', fontSize: 13, fontWeight: '700' },
  optionTextSelected: { color: isDark ? '#BBF7D0' : '#137A42' },
  primaryButton: { minHeight: 52, borderRadius: 999, backgroundColor: '#35C66B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 4 },
  primaryButtonText: { color: '#07111F', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  error: { color: '#FCA5A5', fontSize: 13, textAlign: 'center' },
  footnote: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  successCard: { padding: isMobile ? 22 : 32, borderRadius: 22, borderWidth: 1, borderColor: isDark ? '#365314' : '#A7F3D0', backgroundColor: isDark ? 'rgba(20, 83, 45, 0.18)' : 'rgba(236, 253, 245, 0.9)', alignItems: 'center', gap: 12 },
  successIcon: { color: '#35C66B', fontSize: 42, fontWeight: '900' },
  successTitle: { color: isDark ? '#BBF7D0' : '#137A42', fontSize: 24, fontWeight: '800' },
  successCopy: { color: isDark ? '#C6D1DF' : '#526174', textAlign: 'center', lineHeight: 22 },
});
