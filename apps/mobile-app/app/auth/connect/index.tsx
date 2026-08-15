import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '../../../lib/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { AuthQrApprovalCard } from '../../../components/AuthQrApprovalCard';

const SIGN_IN_REDIRECT_COUNTDOWN_SECONDS = 5;

// Reached by clicking "Open HASHPASS.TECH" on hashpass.club's sign-in modal
// (apps/web-app/app/components/SignInModal.tsx's openHashpassApp()), opened
// in a new tab with the pending challenge's id in the query string. This is
// the desktop-without-a-phone path: instead of scanning the QR with the app,
// the browser that already has this app open (and, ideally, an existing
// session) approves the same challenge directly.
export default function AuthConnectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { user, isLoggedIn, isLoading: authLoading } = useAuth();

  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : undefined;

  const returnTo = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value === 'string') search.set(key, value);
    });
    const query = search.toString();
    return query ? `/auth/connect?${query}` : '/auth/connect';
  }, [params]);

  const [secondsLeft, setSecondsLeft] = useState(SIGN_IN_REDIRECT_COUNTDOWN_SECONDS);
  const redirectedRef = useRef(false);

  const goToSignIn = () => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.replace(`/auth?returnTo=${encodeURIComponent(returnTo)}` as any);
  };

  useEffect(() => {
    if (authLoading || isLoggedIn) return;
    if (secondsLeft <= 0) {
      goToSignIn();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, secondsLeft]);

  const styles = getStyles(isDark, colors);

  const closeOrLeave = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Only actually closes if this tab was opened by script (true for the
      // "Open HASHPASS.TECH" button, which uses window.open()) -- browsers
      // silently no-op window.close() on tabs the user navigated to
      // directly, which is an acceptable, harmless fallback here.
      window.close();
      return;
    }
    router.replace('/(shared)/dashboard/explore' as any);
  };

  if (authLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.subtitle, { marginTop: 16 }]}>Checking your session…</Text>
      </View>
    );
  }

  if (!isLoggedIn || !user) {
    return (
      <View style={styles.container}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.primary} />
        <Text style={styles.title}>You need to sign in first</Text>
        <Text style={styles.subtitle}>
          Sign in to your HashPass account to approve this login.
        </Text>
        <Text style={styles.countdown}>
          Redirecting to sign in in {secondsLeft}…
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={goToSignIn}>
          <Text style={styles.primaryButtonText}>Sign in now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <AuthQrApprovalCard
      challengeId={challengeId}
      onApproved={closeOrLeave}
      onDenied={closeOrLeave}
      onCancel={closeOrLeave}
      invalidTitle="This link is missing information"
      invalidSubtitle="Go back to hashpass.club and click 'Open HASHPASS.TECH' again to get a fresh link."
      invalidActionLabel="Close"
      onInvalidAction={closeOrLeave}
    />
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
      marginBottom: 8,
    },
    countdown: {
      fontSize: 13,
      color: colors.text.faint || colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 12,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
