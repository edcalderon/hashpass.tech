import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createAuthClient } from 'better-auth/client';
import { ENV_CONFIG } from '@hashpass/config';
import { Badge, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../../hooks/useTheme';
import { buildMcpLoginContinuation } from '../../../lib/auth/mcp-login';

export default function McpLoginScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const [error, setError] = useState('');
  const apiBaseUrl = ENV_CONFIG.getApiUrl().replace(/\/$/, '');
  const continuation = useMemo(
    () => buildMcpLoginContinuation(
      typeof window === 'undefined' ? '' : window.location.search,
      apiBaseUrl,
    ),
    [apiBaseUrl],
  );

  useEffect(() => {
    if (!continuation) {
      setError('This authorization request is missing, invalid, or has expired.');
      return;
    }

    let active = true;
    const authClient = createAuthClient({ baseURL: `${apiBaseUrl}/auth` });

    authClient.getSession()
      .then((result) => {
        if (!active) return;
        if (result.data?.user) {
          window.location.replace(continuation.authorizeUrl);
          return;
        }

        router.replace(`/auth?returnTo=${encodeURIComponent(continuation.returnTo)}` as never);
      })
      .catch(() => {
        if (active) setError('We could not verify your Hashpass session. Please try again.');
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, continuation, router]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.canvas }]}>
      <View style={styles.content}>
        <Surface mode={mode} style={styles.surface}>
          <Badge mode={mode}>Hashpass Plane</Badge>
          <Text style={[styles.title, { color: palette.text }]}>Securely connecting your workspace</Text>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.body, { color: palette.danger }]}>{error}</Text>
          ) : (
            <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Checking your Hashpass session">
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.body, { color: palette.muted }]}>Checking your Hashpass session…</Text>
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
