import React, { useMemo, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
import { useIsMobile } from '../hooks/useIsMobile';
import { solveLukasCaptcha } from './LukasCaptcha';
import { ActionButton, FilterChip, Surface } from '@hashpass/ui/primitives';
import { LukasEyebrow, lukasFullWidth, lukasPalette, lukasSectionTitle, lukasSkin, lukasSurface } from './lukas/lukas-ui';
import { LukasGlyph } from './lukas/LukasGlyph';
import { useLukasRewards } from './lukas/LukasRewards';

const API_BASE = 'https://api.hashpass.tech/api';
const BOOKING_URL = 'https://calendar.app.google/vYsTa9GpamSVccAt9';
const MERCHANT_TYPES = ['Coffee shop', 'Events & conferences', 'Coworking', 'Restaurant or retail', 'Other'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateMerchantForm = (contactName: string, email: string, description: string) => ({
  contactName: contactName.trim() ? '' : 'Enter your name.',
  email: !email.trim()
    ? 'Enter your work email.'
    : EMAIL_PATTERN.test(email.trim())
      ? ''
      : 'Enter a valid email address.',
  description: description.trim() ? '' : 'Add a short description.',
});

export function MerchantContactPanel() {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const mode = isDark ? 'dark' : 'light';
  const palette = useMemo(() => lukasPalette(isDark), [isDark]);
  const skin = useMemo(() => lukasSkin(palette), [palette]);
  const styles = useMemo(() => getStyles(isDark, isMobile, palette), [isDark, isMobile, palette]);
  const { earn } = useLukasRewards();
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [merchantType, setMerchantType] = useState(MERCHANT_TYPES[0]);
  const [description, setDescription] = useState('');
  const [bookingPreference, setBookingPreference] = useState('Book a call');
  const [touched, setTouched] = useState({ contactName: false, email: false, description: false });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingSecurity, setCheckingSecurity] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const validation = validateMerchantForm(contactName, email, description);

  const submit = async () => {
    if (busy) return;
    setSubmitted(true);
    const errors = validateMerchantForm(contactName, email, description);
    if (Object.values(errors).some(Boolean)) {
      setError('');
      return;
    }

    setBusy(true);
    setCheckingSecurity(true);
    setError('');
    try {
      const captchaToken = await solveLukasCaptcha();
      setCheckingSecurity(false);
      const response = await fetch(`${API_BASE}/lukas/merchant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: contactName.trim(),
          email: email.trim(),
          merchantType,
          description: description.trim(),
          bookingPreference,
          captchaToken,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'The merchant request could not be sent. Please try again.');
      setSent(true);
      earn('merchant');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The merchant request could not be sent. Please try again.');
    } finally {
      setCheckingSecurity(false);
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.eyebrowRow}><LukasGlyph name="market" size={44} /><LukasEyebrow palette={palette}>For merchants</LukasEyebrow></View>
        <Text style={styles.title}>Bring LUKAS to your counter.</Text>
        <Text style={styles.description}>Tell us where you operate and how you want to use the LatAm index. We will reply from contact@hashpass.tech.</Text>
      </View>
      {sent ? (
        <Surface mode={mode} style={[lukasSurface(palette, { raised: true }), styles.successCard]}>
          <LukasGlyph name="shield" size={64} />
          <Text role="status" accessibilityLiveRegion="polite" style={styles.successTitle}>Request sent</Text>
          <Text style={styles.successCopy}>We sent a confirmation to {email.trim()}. Prefer a faster conversation?</Text>
          <ActionButton mode={mode} skin={skin} label="Book directly" onPress={() => { if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(BOOKING_URL, '_blank', 'noopener,noreferrer'); else void Linking.openURL(BOOKING_URL); }}
            style={lukasFullWidth}
          />
        </Surface>
      ) : (
        <Surface mode={mode} style={[lukasSurface(palette, { raised: true }), styles.formCard]}>
          <FormField
            mode={mode}
            disabled={busy}
            label="Your name"
            value={contactName}
            onChangeText={(value) => { setContactName(value); setError(''); }}
            onBlur={() => setTouched((current) => ({ ...current, contactName: true }))}
            error={(submitted || touched.contactName) ? validation.contactName : undefined}
            autoComplete="name"
          />
          <FormField
            mode={mode}
            disabled={busy}
            label="Work email"
            value={email}
            onChangeText={(value) => { setEmail(value); setError(''); }}
            onBlur={() => setTouched((current) => ({ ...current, email: true }))}
            error={(submitted || touched.email) ? validation.email : undefined}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@business.com"
          />
          <Text style={styles.fieldLabel}>Merchant type</Text>
          <View style={styles.options}>{MERCHANT_TYPES.map((type) => <FilterChip key={type} mode={mode} skin={skin} label={type} selected={merchantType === type} disabled={busy} onPress={() => setMerchantType(type)} style={styles.option} />)}</View>
          <FormField
            mode={mode}
            disabled={busy}
            label="What would you like to enable?"
            value={description}
            onChangeText={(value) => { setDescription(value); setError(''); }}
            onBlur={() => setTouched((current) => ({ ...current, description: true }))}
            error={(submitted || touched.description) ? validation.description : undefined}
            multiline
            numberOfLines={4}
            style={styles.messageInput}
          />
          <Text style={styles.fieldLabel}>Follow-up</Text>
          <View style={styles.options}>
            {['Book a call', 'Email me first'].map((preference) => <FilterChip key={preference} mode={mode} skin={skin} label={preference} selected={bookingPreference === preference} disabled={busy} onPress={() => setBookingPreference(preference)} style={styles.option} />)}
          </View>
          <ActionButton
            mode={mode}
            skin={skin}
            label={busy ? (checkingSecurity ? 'Checking security…' : 'Sending…') : 'Send merchant request'}
            loading={busy}
            disabled={busy}
            aria-busy={busy}
            onPress={submit}
            style={[lukasFullWidth, styles.primaryButton]}
          />
          {error ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Text style={styles.footnote}>We only use this information to respond to your request. See our privacy policy for details.</Text>
        </Surface>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean, palette: ReturnType<typeof lukasPalette>) => StyleSheet.create({
  container: { width: '100%', maxWidth: 900, alignSelf: 'center', marginTop: isMobile ? 48 : 72 },
  header: { marginBottom: 22 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md },
  title: { ...lukasSectionTitle(palette, isMobile), textAlign: 'left', marginTop: uiTokens.space.md },
  description: { color: palette.body, fontSize: 15, lineHeight: 23, marginTop: 10, maxWidth: 680 },
  formCard: { padding: isMobile ? uiTokens.space.lg : uiTokens.space.xxl, borderRadius: uiTokens.radius.card, gap: uiTokens.space.md },
  messageInput: { minHeight: 110, textAlignVertical: 'top', paddingTop: 14 },
  fieldLabel: { color: palette.text, fontSize: uiTokens.type.label, fontWeight: '600', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm },
  option: {},
  primaryButton: { marginTop: uiTokens.space.sm },
  error: { color: palette.danger, fontSize: 13, textAlign: 'center' },
  footnote: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  successCard: { padding: isMobile ? 22 : 32, borderRadius: uiTokens.radius.card, borderColor: palette.border, alignItems: 'center', gap: uiTokens.space.md },
  successTitle: { color: palette.accent, fontSize: 24, fontWeight: '800' },
  successCopy: { color: palette.body, textAlign: 'center', lineHeight: 22 },
});
