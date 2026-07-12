import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { fetchIPLocation, GDPR_COUNTRY_CODES } from '../lib/ipquery';

const CONSENT_KEY = 'hashpass_cookie_consent';

type ConsentLaw = 'gdpr' | 'lgpd' | 'ccpa' | 'pipeda' | 'default';

function detectLaw(countryCode: string): ConsentLaw {
  const code = countryCode.toUpperCase();
  if (GDPR_COUNTRY_CODES.has(code)) return 'gdpr';
  if (code === 'BR') return 'lgpd';
  if (code === 'US') return 'ccpa';
  if (code === 'CA') return 'pipeda';
  return 'default';
}

const LAW_BODY_KEY: Record<ConsentLaw, string> = {
  gdpr:    'consentBodyGDPR',
  lgpd:    'consentBodyLGPD',
  ccpa:    'consentBodyCCPA',
  pipeda:  'consentBodyPIPEDA',
  default: 'consentBodyDefault',
};

function getStoredConsent(): 'granted' | 'denied' | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch { return null; }
}

function applyGtagConsent(decision: 'granted' | 'denied'): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CONSENT_KEY, decision); } catch {}
  const w = window as any;
  if (typeof w.gtag === 'function') {
    w.gtag('consent', 'update', { analytics_storage: decision });
  }
}

export default function CookieConsentBanner() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('cookies');
  const [visible, setVisible] = useState(false);
  const [law, setLaw] = useState<ConsentLaw>('default');

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const stored = getStoredConsent();
    if (stored !== null) {
      // Already decided — apply silently, never show banner again
      applyGtagConsent(stored);
      return;
    }

    // Detect country via ipquery.io (timezone fallback built in), then show banner.
    // We wait for detection so the law text is correct on first render.
    fetchIPLocation().then((loc) => {
      setLaw(detectLaw(loc?.country_code ?? ''));
      setVisible(true);
    });
  }, []);

  if (Platform.OS !== 'web' || !visible) return null;

  const handleAccept = () => {
    applyGtagConsent('granted');
    setVisible(false);
  };

  const handleDecline = () => {
    applyGtagConsent('denied');
    setVisible(false);
  };

  const styles = getStyles(isDark, colors);

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.textBlock}>
          <Text style={styles.heading}>
            {t('consentTitle', 'Cookie preferences')}
          </Text>
          <Text style={styles.body}>
            {t(LAW_BODY_KEY[law], FALLBACK_BODY[law])}{' '}
            <Text style={styles.link} onPress={() => router.push('/privacy' as any)}>
              {t('consentPrivacy', 'Privacy Policy')}
            </Text>
          </Text>
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.declineButton} onPress={handleDecline}>
            <Text style={styles.declineText}>{t('consentDecline', 'Reject non-essential')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAccept}>
            <Text style={styles.acceptText}>{t('consentAccept', 'Accept')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// English fallbacks — used when the locale file key is missing
const FALLBACK_BODY: Record<ConsentLaw, string> = {
  gdpr:    'EU law (GDPR) requires your consent before we can set analytics cookies. We use Google Analytics to understand how this site is used.',
  lgpd:    'Brazilian law (LGPD) requires your consent before we can set analytics cookies. We use Google Analytics to understand how this site is used.',
  ccpa:    'US privacy law (CCPA) gives you the right to opt out of analytics tracking. We use Google Analytics to understand how this site is used.',
  pipeda:  'Canadian law (PIPEDA) requires your consent before we can set analytics cookies. We use Google Analytics to understand how this site is used.',
  default: 'We use Google Analytics to understand how this site is used. Please let us know if you consent to analytics cookies.',
};

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      position: 'fixed' as any,
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9998,
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 8,
      pointerEvents: 'box-none' as any,
    },
    inner: {
      backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
      borderRadius: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 14,
      maxWidth: 900,
      alignSelf: 'center',
      width: '100%',
      boxShadow: `0 -2px 20px rgba(0,0,0,${isDark ? '0.40' : '0.12'}), 0 0 0 1px ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
    },
    textBlock: {
      flex: 1,
      minWidth: 240,
      gap: 3,
    },
    heading: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 2,
    },
    body: {
      fontSize: 13,
      color: colors.text.secondary,
      lineHeight: 18,
    },
    link: {
      color: colors.primary,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
      flexShrink: 0,
    },
    declineButton: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.divider,
      justifyContent: 'center',
      alignItems: 'center',
    },
    declineText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    acceptButton: {
      paddingHorizontal: 20,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      boxShadow: '0 2px 8px rgba(200,16,0,0.30)',
    },
    acceptText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
