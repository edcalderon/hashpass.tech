import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { HashpassError } from '@hashpass/sdk';
import { hashpassSdk } from '../lib/hashpass-sdk';

type ApprovalState = 'idle' | 'submitting' | 'approved' | 'denied' | 'error';

interface AuthQrApprovalCardProps {
  challengeId: string | undefined;
  onApproved: () => void;
  onDenied: () => void;
  onCancel: () => void;
  invalidTitle?: string;
  invalidSubtitle?: string;
  invalidActionLabel?: string;
  onInvalidAction: () => void;
}

// Shared by every place a HashPass Auth login gets approved under the app's
// own session: scanning the QR (app/(shared)/dashboard/auth-qr-approve.tsx)
// and opening the connect link directly from a desktop browser
// (app/auth/connect/index.tsx). Both just need a challengeId and a place to
// send the user once the decision is made -- everything else (calling
// respondToLogin, the three-state result UI) is identical.
export function AuthQrApprovalCard({
  challengeId,
  onApproved,
  onDenied,
  onCancel,
  invalidTitle = 'Invalid QR code',
  invalidSubtitle = "This doesn't look like a HashPass Auth login code.",
  invalidActionLabel = 'Close',
  onInvalidAction,
}: AuthQrApprovalCardProps) {
  const { colors, isDark } = useTheme();
  const [state, setState] = useState<ApprovalState>('idle');
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
        <Text style={styles.title}>{invalidTitle}</Text>
        <Text style={styles.subtitle}>{invalidSubtitle}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onInvalidAction}>
          <Text style={styles.primaryButtonText}>{invalidActionLabel}</Text>
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
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={state === 'approved' ? onApproved : onDenied}
        >
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

      <TouchableOpacity onPress={onCancel} style={styles.cancelLink}>
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
