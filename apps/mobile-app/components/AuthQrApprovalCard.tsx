import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { HashpassError } from '@hashpass/sdk';
import { hashpassSdk } from '../lib/hashpass-sdk';
import { getHashpassFullLogo } from '../lib/hashpass-logo';

type ApprovalState = 'idle' | 'submitting' | 'approved' | 'denied' | 'error' | 'needs_sign_in';

const SIGN_IN_COUNTDOWN_SECONDS = 5;

interface AuthQrApprovalCardProps {
  challengeId: string | undefined;
  // Whether the app's own session is ready to actually call respondToLogin()
  // with. 'checking' covers both auth loading AND the async Better
  // Auth -> Supabase bridge session landing (see USER_REGISTRY.md) --
  // callers should pass 'checking' until they have a real bridged session,
  // not just isLoggedIn, since respondToLogin() needs the latter.
  sessionStatus: 'checking' | 'ready' | 'signed_out';
  onApproved: () => void;
  onDenied: () => void;
  onCancel: () => void;
  // Used both for the upfront sessionStatus === 'signed_out' state and as a
  // fallback if respondToLogin() itself still 401s (a session can expire
  // between the upfront check and the tap).
  onSignInRequired: () => void;
  invalidTitle?: string;
  invalidSubtitle?: string;
  invalidActionLabel?: string;
  onInvalidAction: () => void;
  // "Done" reads fine for the scan flow (you're just closing a screen
  // in-app), but the connect flow was opened from a specific browser tab on
  // another site -- telling the user where "Done" actually sends them back
  // to matters there. Defaults to the scan flow's plain "Done".
  doneLabel?: string;
}

// Shared by every place a HASHPASS Auth login gets approved under the app's
// own session: scanning the QR (app/(shared)/dashboard/auth-qr-approve.tsx)
// and opening the connect link directly from a desktop browser
// (app/auth/connect/index.tsx). Both just need a challengeId, their current
// session status, and a place to send the user once the decision is made --
// everything else (the session gate, calling respondToLogin, the result UI)
// is identical and lives here so neither screen can drift out of sync with
// the other on auth handling.
export function AuthQrApprovalCard({
  challengeId,
  sessionStatus,
  onApproved,
  onDenied,
  onCancel,
  onSignInRequired,
  invalidTitle = 'Invalid QR code',
  invalidSubtitle = "This doesn't look like a HASHPASS Auth login code.",
  invalidActionLabel = 'Close',
  onInvalidAction,
  doneLabel = 'Done',
}: AuthQrApprovalCardProps) {
  const { colors, isDark } = useTheme();
  const [state, setState] = useState<ApprovalState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SIGN_IN_COUNTDOWN_SECONDS);
  const redirectedRef = useRef(false);

  const styles = getStyles(isDark, colors);

  const goToSignIn = () => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    onSignInRequired();
  };

  useEffect(() => {
    if (sessionStatus !== 'signed_out') return;
    if (secondsLeft <= 0) {
      goToSignIn();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, secondsLeft]);

  const respond = async (decision: 'approve' | 'deny') => {
    if (!challengeId || state === 'submitting') return;
    setState('submitting');
    setErrorMessage(null);

    try {
      await hashpassSdk().authQr.respondToLogin(challengeId, decision);
      setState(decision === 'approve' ? 'approved' : 'denied');
    } catch (error) {
      if (error instanceof HashpassError && error.code === 'unauthorized') {
        setState('needs_sign_in');
        return;
      }
      const message =
        error instanceof HashpassError
          ? error.message
          : 'Something went wrong. Please try again.';
      setErrorMessage(message);
      setState('error');
    }
  };

  const logo = <Image source={getHashpassFullLogo(isDark)} style={styles.logo} resizeMode="contain" />;

  if (sessionStatus === 'checking') {
    return (
      <View style={styles.container}>
        {logo}
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        <Text style={[styles.subtitle, { marginTop: 16 }]}>Checking your session…</Text>
      </View>
    );
  }

  if (sessionStatus === 'signed_out' || state === 'needs_sign_in') {
    return (
      <View style={styles.container}>
        {logo}
        <Ionicons name="lock-closed-outline" size={40} color={colors.primary} style={{ marginTop: 16 }} />
        <Text style={styles.title}>Sign in required</Text>
        <Text style={styles.subtitle}>
          You need to sign in to your HASHPASS account first. Sign in, then come back and try again.
        </Text>
        {sessionStatus === 'signed_out' && (
          <Text style={styles.countdown}>Redirecting to sign in in {secondsLeft}…</Text>
        )}
        <TouchableOpacity style={styles.primaryButton} onPress={goToSignIn}>
          <Text style={styles.primaryButtonText}>Sign in now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!challengeId) {
    return (
      <View style={styles.container}>
        {logo}
        <Ionicons name="alert-circle-outline" size={40} color={colors.error.main} style={{ marginTop: 16 }} />
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
        {logo}
        <Ionicons
          name={state === 'approved' ? 'checkmark-circle' : 'close-circle'}
          size={52}
          color={state === 'approved' ? colors.success.main : colors.error.main}
          style={{ marginTop: 16 }}
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
          <Text style={styles.primaryButtonText}>{doneLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {logo}
      <Text style={styles.title}>Sign in with HASHPASS Auth</Text>
      <Text style={styles.subtitle}>
        Someone is trying to sign in using your HASHPASS account. If this is you, approve it below.
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
    logo: {
      width: 132,
      height: 40,
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
    countdown: {
      fontSize: 13,
      color: colors.text.faint || colors.text.secondary,
      textAlign: 'center',
      marginTop: -12,
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
