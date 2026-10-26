import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createAuthClient } from 'better-auth/client';
import { ENV_CONFIG } from '@hashpass/config';
import { ActionButton, Badge, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useMcpAuthorizationMachine } from '../../../hooks/mcp-authorization-machine';
import { useTheme } from '../../../hooks/useTheme';
import {
  buildMcpLoginContinuation,
  getMcpAuthorizationRequest,
} from '../../../lib/auth/mcp-login';

export default function McpLoginScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const apiBaseUrl = ENV_CONFIG.getApiUrl().replace(/\/$/, '');
  const rawSearch = typeof window === 'undefined' ? '' : window.location.search;
  const request = useMemo(() => getMcpAuthorizationRequest(rawSearch), [rawSearch]);
  const continuation = useMemo(
    () => buildMcpLoginContinuation(rawSearch, apiBaseUrl),
    [apiBaseUrl, rawSearch],
  );
  const { send, view } = useMcpAuthorizationMachine({ flow: 'login', request });
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (view.phase !== 'checkingSession') return;

    let active = true;
    const authClient = createAuthClient({ baseURL: `${apiBaseUrl}/auth` });

    authClient.getSession()
      .then((result) => {
        if (!active) return;
        send({ type: result.data?.user ? 'SESSION_AUTHENTICATED' : 'SESSION_ANONYMOUS' });
      })
      .catch(() => {
        if (active) {
          send({
            type: 'SESSION_CHECK_FAILED',
            message: 'We could not verify your HASHPASS session. Please try again.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, send, view.phase]);

  useEffect(() => {
    if (!continuation || hasNavigated.current) return;

    if (view.canRedirectToAuthorization) {
      hasNavigated.current = true;
      window.location.replace(continuation.authorizeUrl);
      return;
    }

    if (view.phase === 'signInRequired') {
      hasNavigated.current = true;
      router.replace(`/auth?returnTo=${encodeURIComponent(continuation.returnTo)}` as never);
    }
  }, [continuation, router, view.canRedirectToAuthorization, view.phase]);

  const statusMessage = view.phase === 'signInRequired'
    ? 'Opening HASHPASS sign in…'
    : view.phase === 'authorizationRedirect'
      ? 'Continuing your secure connection…'
      : 'Checking your HASHPASS session…';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.canvas }]}>
      <View style={styles.content}>
        <Surface mode={mode} style={styles.surface}>
          <Badge mode={mode}>HASHPASS Plane</Badge>
          <Text style={[styles.title, { color: palette.text }]}>Securely connecting your workspace</Text>
          {view.error ? (
            <>
              <Text accessibilityRole="alert" style={[styles.body, { color: palette.danger }]}>{view.error}</Text>
              {view.canRetry && (
                <ActionButton mode={mode} label="Try again" onPress={() => send({ type: 'RETRY' })} />
              )}
            </>
          ) : (
            <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={statusMessage}>
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.body, { color: palette.muted }]}>{statusMessage}</Text>
            </View>
          )}
        </Surface>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: uiTokens.space.xl },
  surface: { width: '100%', maxWidth: 640, gap: uiTokens.space.lg },
  title: { fontSize: uiTokens.type.heading, lineHeight: 40, fontWeight: '700' },
  body: { fontSize: uiTokens.type.body, lineHeight: 26 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md },
});
