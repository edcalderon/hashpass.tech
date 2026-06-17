import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { useTranslation, getCurrentLocale } from '../i18n/i18n';
import { useTheme } from '../hooks/useTheme';
import { apiClient } from '../lib/api-client';

type Mode = "light" | "dark";

interface Props {
  mode: Mode;
}

const imageUrls = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1654110455429-cf322b40a906?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=200&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1586297135537-94bc9ba060aa?q=80&w=200&auto=format&fit=crop',
];

const Newsletter = ({ mode }: Props) => {
  const { t } = useTranslation('newsletter');
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [subscribers, setSubscribers] = useState(1000);
  const { isDark } = useTheme();

  const validateEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSubscribe = async () => {
    setError('');
    if (!email) { setError('Email is required'); return; }
    if (!validateEmail(email)) { setError('Please enter a valid email address'); return; }
    setIsLoading(true);
    try {
      const locale = getCurrentLocale();
      const response = await apiClient.post('/subscribe', { email, locale }, { skipEventSegment: true });
      if (!response.success) {
        const msg = response.error || '';
        if (msg.toLowerCase().includes('already subscribed')) {
          setSubscribed(true);
        } else {
          setError(msg || 'Failed to subscribe. Please try again.');
        }
        return;
      }
      setSubscribed(true);
      setSubscribers((s) => s + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to subscribe. Please try again.';
      if (msg.toLowerCase().includes('already subscribed')) {
        setSubscribed(true);
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const textColor = mode === 'dark' ? '#fff' : '#111';
  const btnBg = isDark ? '#0e7490' : '#b91c1c';

  if (subscribed) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, { backgroundColor: mode === 'dark' ? 'transparent' : '#fff' }]}>
          <Text style={[styles.successTitle, { color: textColor }]}>{t('successTitle')}</Text>
          <Text style={[styles.successMsg, { color: textColor }]}>
            {t('successMessage')} {email}. {t('successMessageEmail')}
          </Text>
          <TouchableOpacity onPress={() => { setSubscribed(false); setEmail(''); }}>
            <Text style={styles.backLink}>{t('backToForm')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.card, { backgroundColor: mode === 'dark' ? 'transparent' : '#fff' }]}>
        <Text style={[styles.title, { color: textColor }]}>{t('title')}</Text>
        <Text style={[styles.subtitle, { color: textColor, opacity: 0.6 }]}>{t('subtitle')}</Text>

        <View style={styles.avatarRow}>
          {imageUrls.map((url, i) => (
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

        <TextInput
          value={email}
          onChangeText={(v) => { setEmail(v); if (error) setError(''); }}
          placeholder={t('emailPlaceholder')}
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isLoading}
          style={[
            styles.input,
            { color: textColor, borderColor: error ? '#ef4444' : '#d1d5db' },
            mode === 'dark' && { backgroundColor: 'rgba(255,255,255,0.08)' },
          ]}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={isLoading}
          style={[styles.btn, { backgroundColor: btnBg, opacity: isLoading ? 0.7 : 1 }]}
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
    fontSize: 15, marginBottom: 8,
  },
  errorText: { color: '#ef4444', fontSize: 12, marginBottom: 8 },
  btn: { borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  privacy: { fontSize: 11, color: '#9ca3af', textAlign: 'center' },
  successTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  successMsg: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  backLink: { color: '#3b82f6', textAlign: 'center', fontSize: 14, fontWeight: '500' },
});

export default Newsletter;
