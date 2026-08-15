import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, ScrollView } from 'react-native';
import { Ionicons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { hashpassSdk } from '../lib/hashpass-sdk';
import { getHashpassFullLogo } from '../lib/hashpass-logo';
import {
  createAuthQrApprovalActor,
  type AuthQrApprovalMachineSnapshot,
  type SessionStatus,
} from '../hooks/auth-qr-approval-machine';

// Web's CookieConsentBanner (components/CookieConsentBanner.tsx) is
// position:fixed, docked to the bottom of the viewport with zIndex 9998 --
// on a short viewport, a plain vertically-centered View can place this
// card's primary button right where that banner intercepts taps, making it
// look unresponsive. Scrollable + extra bottom padding keeps the button
// reachable either way: still visually centered when it fits, scrollable
// past the banner when it doesn't.
function CardScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

interface AuthQrApprovalCardProps {
  challengeId: string | undefined;
  // Whether the app's own session is ready to actually call respondToLogin()
  // with. 'checking' covers both auth loading AND the async Better
  // Auth -> Supabase bridge session landing (see USER_REGISTRY.md) --
  // callers should pass 'checking' until they have a real bridged session,
  // not just isLoggedIn, since respondToLogin() needs the latter.
  sessionStatus: SessionStatus;
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
// runs through hooks/auth-qr-approval-machine.ts so neither screen can
// drift out of sync with the other on auth handling.
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
  const styles = getStyles(isDark, colors);

  const actorRef = useRef(
    createAuthQrApprovalActor({
      challengeId,
      respondToLogin: (id, decision) => hashpassSdk().authQr.respondToLogin(id, decision),
      onApproved,
      onDenied,
      onCancel,
      onSignInRequired,
      onInvalidAction,
    })
  );
  const [snapshot, setSnapshot] = useState<AuthQrApprovalMachineSnapshot>(
    actorRef.current.getSnapshot()
  );

  useEffect(() => {
    const actor = actorRef.current;
    const subscription = actor.subscribe(setSnapshot);
    actor.start();
    actor.send({ type: 'SESSION_STATUS', status: sessionStatus });

    // A single 1s interval both advances the visible countdown and, once it
    // reaches zero, is what actually fires onSignInRequired -- the machine's
    // 'signedOut' state only reacts to TICK while it's the active state, so
    // this is harmless to send unconditionally in every other state.
    const interval = setInterval(() => actor.send({ type: 'TICK' }), 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
      actor.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    actorRef.current.send({ type: 'SESSION_STATUS', status: sessionStatus });
  }, [sessionStatus]);

  const logo = <Image source={getHashpassFullLogo(isDark)} style={styles.logo} resizeMode="contain" />;

  if (snapshot.matches('checkingSession')) {
    return (
      <CardScroll>
        <View style={styles.container}>
          {logo}
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          <Text style={[styles.subtitle, { marginTop: 16 }]}>Waiting for session…</Text>
        </View>
      </CardScroll>
    );
  }

  if (snapshot.matches('signedOut')) {
    return (
      <CardScroll>
        <View style={styles.container}>
          {logo}
          <Ionicons name="lock-closed-outline" size={40} color={colors.primary} style={{ marginTop: 16 }} />
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.subtitle}>
            You need to sign in to your HASHPASS account first. Sign in, then come back and try again.
          </Text>
          <Text style={styles.countdown}>
            Redirecting to sign in in {snapshot.context.secondsLeft}…
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => actorRef.current.send({ type: 'SIGN_IN_NOW' })}
          >
            <Text style={styles.primaryButtonText}>Sign in now</Text>
          </TouchableOpacity>
        </View>
      </CardScroll>
    );
  }

  if (snapshot.matches('invalidChallenge')) {
    return (
      <CardScroll>
        <View style={styles.container}>
          {logo}
          <Ionicons name="alert-circle-outline" size={40} color={colors.error.main} style={{ marginTop: 16 }} />
          <Text style={styles.title}>{invalidTitle}</Text>
          <Text style={styles.subtitle}>{invalidSubtitle}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => actorRef.current.send({ type: 'INVALID_ACTION' })}
          >
            <Text style={styles.primaryButtonText}>{invalidActionLabel}</Text>
          </TouchableOpacity>
        </View>
      </CardScroll>
    );
  }

  if (snapshot.matches('approved') || snapshot.matches('denied')) {
    const approved = snapshot.matches('approved');
    return (
      <CardScroll>
        <View style={styles.container}>
          {logo}
          <Ionicons
            name={approved ? 'checkmark-circle' : 'close-circle'}
            size={52}
            color={approved ? colors.success.main : colors.error.main}
            style={{ marginTop: 16 }}
          />
          <Text style={styles.title}>{approved ? 'Login approved' : 'Login denied'}</Text>
          <Text style={styles.subtitle}>
            {approved
              ? 'You can go back to your browser to finish signing in.'
              : "We told the browser this login wasn't you."}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => actorRef.current.send({ type: 'DONE' })}
          >
            <Text style={styles.primaryButtonText}>{doneLabel}</Text>
          </TouchableOpacity>
        </View>
      </CardScroll>
    );
  }

  // idle | submitting | error
  return (
    <CardScroll>
      <View style={styles.container}>
        {logo}
        <Text style={styles.title}>Sign in with HASHPASS Auth</Text>
        <Text style={styles.subtitle}>
          Someone is trying to sign in using your HASHPASS account. If this is you, approve it below.
        </Text>

        {snapshot.matches('error') && snapshot.context.errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{snapshot.context.errorMessage}</Text>
          </View>
        )}

        {snapshot.matches('submitting') ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => actorRef.current.send({ type: snapshot.matches('error') ? 'RETRY' : 'APPROVE' })}
            >
              <Text style={styles.primaryButtonText}>{snapshot.matches('error') ? 'Try again' : 'Approve'}</Text>
            </TouchableOpacity>
            {!snapshot.matches('error') && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => actorRef.current.send({ type: 'DENY' })}
              >
                <Text style={styles.secondaryButtonText}>Deny</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity
          onPress={() => actorRef.current.send({ type: 'CANCEL' })}
          style={styles.cancelLink}
        >
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </CardScroll>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      // Extra bottom room so the primary button clears web's fixed,
      // zIndex:9998 CookieConsentBanner instead of sitting right under it.
      paddingBottom: 140,
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
