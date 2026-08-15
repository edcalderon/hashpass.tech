import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '../../../lib/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { HashpassError } from '@hashpass/sdk';
import { hashpassSdk } from '../../../lib/hashpass-sdk';

type ApproveScreenState = 'idle' | 'submitting' | 'approved' | 'denied' | 'error';

// Reached by scanning a HashPass Auth QR code (see lib/auth-qr.ts and the
// onRawScan wiring in _layout.tsx's QRScanner usages). The browser that
// showed the QR code is polling the API for this decision -- see
// packages/hashpass-links-api/src/routes/auth-qr.ts's approveChallenge().
export default function AuthQrApproveScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : undefined;

  const [state, setState] = useState<ApproveScreenState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const styles = getStyles(isDark, colors);

  const respond = async (decision: 'approve' | 'deny') => {
    if (!challengeId || state === 'submitting') return;
    setState('submitting');
    setErrorMessage(null);

    try {
      await hashpassSdk().authQr.respondToLogin(challengeId, decision);
      setState(decision === 'approve' ? 'approved' : 'denied');
    } catch (error) {
      const message =
        error instanceof HashpassError
          ? error.message
          : 'Something went wrong. Please try again.';
      setErrorMessage(message);
      setState('error');
    }
  };

  if (!challengeId) {
    return (
      <View style={styles.container}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error.main} />
        <Text style={styles.title}>Invalid QR code</Text>
        <Text style={styles.subtitle}>This doesn't look like a HashPass Auth login code.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'approved' || state === 'denied') {
    return (
      <View style={styles.container}>
        <Ionicons
          name={state === 'approved' ? 'checkmark-circle' : 'close-circle'}
          size={56}
          color={state === 'approved' ? colors.success.main : colors.error.main}
        />
        <Text style={styles.title}>
          {state === 'approved' ? 'Login approved' : 'Login denied'}
        </Text>
        <Text style={styles.subtitle}>
          {state === 'approved'
            ? 'You can go back to your browser to finish signing in.'
            : "We told the browser this login wasn't you."}
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="qr-code-outline" size={48} color={colors.primary} />
      <Text style={styles.title}>Sign in with HashPass Auth</Text>
      <Text style={styles.subtitle}>
        Someone is trying to sign in using your HashPass account. If this is you, approve it below.
      </Text>

      {state === 'error' && errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      {state === 'submitting' ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => respond('approve')}>
            <Text style={styles.primaryButtonText}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => respond('deny')}>
            <Text style={styles.secondaryButtonText}>Deny</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
        <Text style={styles.cancelLinkText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      backgroundColor: colors.background.default,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    actions: {
      width: '100%',
      gap: 12,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      width: '100%',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.divider,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      width: '100%',
    },
    secondaryButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    cancelLink: {
      marginTop: 20,
    },
    cancelLinkText: {
      color: colors.text.faint || colors.text.secondary,
      fontSize: 13,
    },
    errorBanner: {
      backgroundColor: 'rgba(255, 59, 48, 0.12)',
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      width: '100%',
    },
    errorBannerText: {
      color: colors.error.main,
      fontSize: 13,
      textAlign: 'center',
    },
  });
