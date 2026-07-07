import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
  Animated,
} from 'react-native';
import { useTranslation, getCurrentLocale } from '../i18n/i18n';
import { useTheme } from '../hooks/useTheme';
import { apiClient } from '../lib/api-client';

type Mode = 'light' | 'dark';
interface Props { mode: Mode; }

const AVATAR_URLS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1654110455429-cf322b40a906?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1586297135537-94bc9ba060aa?q=80&w=200&auto=format&fit=crop',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTDOWN_SECONDS = 9;

const Newsletter = ({ mode }: Props) => {
  const { t } = useTranslation('newsletter');
  const { isDark } = useTheme();

  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [subscribers, setSubscribers] = useState(1000);
  const [countdown, setCountdown] = useState<number | null>(null);

  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  // Entrance animation when success screen mounts
  useEffect(() => {
    if (subscribed) {
      Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 10, useNativeDriver: true }).start();
    } else {
      scaleAnim.setValue(0.92);
    }
  }, [subscribed]);

  // 9-second countdown auto-reset
  useEffect(() => {
    if (!subscribed) {
      setCountdown(null);
      return;
    }
    setCountdown(COUNTDOWN_SECONDS);

    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(id);
          setSubscribed(false);
          setEmail('');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [subscribed]);

  const handleSubscribe = async () => {
    setError('');
    setInfoMessage('');
    if (!email.trim()) { setError(t('errorRequired')); return; }
    if (!EMAIL_RE.test(email.trim())) { setError(t('errorInvalidEmail')); return; }

    setIsLoading(true);
    try {
      const locale = getCurrentLocale();
      const response = await apiClient.post(
        '/subscribe',
        { email: email.trim(), locale, source: 'native' },
        { skipEventSegment: true }
      );

      if (!response.success) {
        if ((response as any).alreadySubscribed) {
          setInfoMessage(t('alreadySubscribed'));
        } else {
          setError(response.error || t('errorFailed'));
        }
        return;
      }

      setSubscribed(true);
      setSubscribers(s => s + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const textColor = mode === 'dark' ? '#fff' : '#111';
  const btnBg = isDark ? '#0e7490' : '#b91c1c';
  const cardBg = mode === 'dark' ? 'transparent' : '#fff';

  if (subscribed) {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.card, { backgroundColor: cardBg, transform: [{ scale: scaleAnim }] }]}>
          {/* Check icon */}
          <View style={styles.successIconWrap}>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
          </View>

          <Text style={[styles.successTitle, { color: textColor }]}>{t('successTitle')}</Text>
          <Text style={[styles.successMsg, { color: textColor, opacity: 0.75 }]}>
            {getCurrentLocale() === 'ko'
              ? `${email} ${t('successMessage')} ${t('successMessageEmail')}`
              : `${t('successMessage')} ${email}. ${t('successMessageEmail')}`}
          </Text>

          {/* Countdown ring + auto-return label + back button */}
          {countdown !== null && (
            <View style={styles.countdownWrap}>
              {/* SVG-equivalent via Animated border — native doesn't support SVG stroke-dashoffset natively */}
              {/* Use a simple circular progress via border trick */}
              <View style={styles.ringOuter}>
                <Text style={styles.ringNumber}>{countdown}</Text>
              </View>
              <Text style={styles.autoReturnLabel}>{t('autoReturning')}</Text>
              <TouchableOpacity
                onPress={() => { setSubscribed(false); setEmail(''); }}
                style={styles.backBtn}
              >
                <Text style={styles.backBtnText}>← {t('backToForm')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <Text style={[styles.title, { color: textColor }]}>{t('title')}</Text>
        <Text style={[styles.subtitle, { color: textColor, opacity: 0.6 }]}>{t('subtitle')}</Text>

        {/* Avatar row */}
        <View style={styles.avatarRow}>
          {AVATAR_URLS.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={[styles.avatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]}
            />
          ))}
          <Text style={styles.subscribersText}>
            <Text style={{ fontWeight: 'bold' }}>{subscribers}+</Text> {t('subscribers')}
          </Text>
        </View>

        {/* Email input */}
        <TextInput
          value={email}
          onChangeText={v => {
            setEmail(v);
            if (error) setError('');
            if (infoMessage) setInfoMessage('');
          }}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isLoading}
          style={[
            styles.input,
            { color: textColor, borderColor: error ? '#ef4444' : '#d1d5db' },
            mode === 'dark' && { backgroundColor: 'rgba(255,255,255,0.08)' },
          ]}
        />

        {/* Error message */}
        {error ? (
          <View style={styles.msgRow}>
            <Text style={styles.msgIcon}>⚠</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Already-subscribed info message */}
        {infoMessage ? (
          <View style={styles.msgRow}>
            <Text style={styles.infoIcon}>✓</Text>
            <Text style={styles.infoText}>{infoMessage}</Text>
          </View>
        ) : null}

        {/* Subscribe button */}
        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={isLoading}
          style={[styles.btn, { backgroundColor: btnBg, opacity: isLoading ? 0.7 : 1 }]}
          activeOpacity={0.85}
        >
          {isLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>{t('subscribe')}</Text>
          }
        </TouchableOpacity>

        <Text style={styles.privacy}>{t('privacy')}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 24, paddingHorizontal: 16 },
  card: { borderRadius: 16, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  subscribersText: { marginLeft: 12, fontSize: 13, color: '#6b7280' },
  input: {
    borderWidth: 1, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 16,
    fontSize: 15, marginBottom: 6,
  },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, paddingHorizontal: 4 },
  msgIcon: { fontSize: 12, marginRight: 5, marginTop: 1, color: '#ef4444' },
  errorText: { color: '#ef4444', fontSize: 12, flex: 1, lineHeight: 18 },
  infoIcon: { fontSize: 12, marginRight: 5, marginTop: 1, color: '#10b981' },
  infoText: { color: '#10b981', fontSize: 12, flex: 1, lineHeight: 18 },
  btn: { borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  privacy: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },
  // Success screen
  successIconWrap: { alignItems: 'center', marginBottom: 16 },
  successIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(52,199,89,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(52,199,89,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  successIconText: { fontSize: 32, color: '#34C759' },
  successTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  successMsg: { fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  countdownWrap: { alignItems: 'center', gap: 8 },
  ringOuter: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 2.5, borderColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  ringNumber: { fontSize: 16, fontWeight: '700', color: '#3b82f6' },
  autoReturnLabel: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
  backBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  backBtnText: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },
});

export default Newsletter;
