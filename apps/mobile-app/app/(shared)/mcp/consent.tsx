import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { createAuthClient } from 'better-auth/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { ENV_CONFIG } from '@hashpass/config';
import { ActionButton, Badge, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useMcpAuthorizationMachine } from '../../../hooks/mcp-authorization-machine';
import { useTheme } from '../../../hooks/useTheme';
import type { ConsentDetails, ConsentResponse } from '../../../types/mcp-consent.types';
import { apiClient } from '@/lib/api-client';
import {
  buildMcpLoginContinuation,
  extractSignedOAuthQuery,
  getMcpAuthorizationRequest,
} from '@/lib/auth/mcp-login';

const scopeLabels: Record<string, string> = {
  'plane:read': 'Read HASHPASS projects, milestones, modules, and work items',
  'plane:write': 'Create and update HASHPASS planning data after confirmation',
  offline_access: 'Stay connected until you revoke access',
  profile: 'Identify your HASHPASS account',
  email: 'Verify that your account is approved for internal access',
};

const isExpiredRequestError = (message: string) => /\bexpired\b/i.test(message);

export default function McpConsentScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const apiBaseUrl = ENV_CONFIG.getApiUrl().replace(/\/$/, '');
  const authBaseUrl = `${apiBaseUrl}/auth`;
  const authClient = useMemo(
    () => createAuthClient({ baseURL: authBaseUrl, plugins: [oauthProviderClient()] }),
    [authBaseUrl],
  );
  const rawSearch = typeof window === 'undefined' ? '' : window.location.search;
  const authorizationQuery = useMemo(
    () => extractSignedOAuthQuery(rawSearch),
    [rawSearch],
  );
  const request = useMemo(
    () => getMcpAuthorizationRequest(authorizationQuery),
    [authorizationQuery],
  );
  const continuation = useMemo(
    () => buildMcpLoginContinuation(rawSearch, apiBaseUrl),
    [apiBaseUrl, rawSearch],
  );
  const { send, view } = useMcpAuthorizationMachine({ flow: 'consent', request });
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (view.phase !== 'checkingSession') return;

    let active = true;
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
  }, [authClient, send, view.phase]);

  useEffect(() => {
    if (!continuation || hasNavigated.current || view.phase !== 'signInRequired') return;

    hasNavigated.current = true;
    router.replace(`/auth?returnTo=${encodeURIComponent(continuation.returnTo)}` as never);
  }, [continuation, router, view.phase]);

  useEffect(() => {
    if (view.phase !== 'consentVerification') return;

    let active = true;
    const verifyRequest = apiClient.get(`/auth/mcp-consent-query?${authorizationQuery}`, {
      skipEventSegment: true,
    }) as Promise<ConsentResponse>;

    verifyRequest
      .then((response: ConsentResponse) => {
        if (!active) return;
        if (!response.success) {
          const message = response.error || 'Could not verify this request.';
          send(isExpiredRequestError(message)
            ? { type: 'CONSENT_EXPIRED' }
            : { type: 'CONSENT_VERIFICATION_FAILED', message });
          return;
        }
        if (!response.data) {
          send({
            type: 'CONSENT_VERIFICATION_FAILED',
            message: 'Could not verify this request.',
          });
          return;
        }

        setDetails(response.data);
        send({ type: 'CONSENT_VERIFIED' });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const message = reason instanceof Error ? reason.message : 'Could not verify this request.';
        send(isExpiredRequestError(message)
          ? { type: 'CONSENT_EXPIRED' }
          : { type: 'CONSENT_VERIFICATION_FAILED', message });
      });

    return () => {
      active = false;
    };
  }, [authorizationQuery, send, view.phase]);

  const decide = useCallback(async (accept: boolean) => {
    if (!view.canSubmitConsent) return;

    send({ type: 'CONSENT_SUBMIT' });
    try {
      const result = await (authClient as any).oauth2.consent({ accept });
      if (result?.error) throw new Error(result.error.message || 'Authorization failed.');
      const redirect = result?.data?.redirectURI || result?.data?.redirectUri || result?.data?.url;
      if (!redirect || typeof window === 'undefined') {
        throw new Error('The authorization provider did not return a redirect.');
      }

      send({ type: 'CONSENT_COMPLETED' });
      window.location.assign(redirect);
    } catch (reason) {
      send({
        type: 'CONSENT_SUBMISSION_FAILED',
        message: reason instanceof Error ? reason.message : 'Authorization failed.',
      });
    }
  }, [authClient, send, view.canSubmitConsent]);

  const verifiedDetailsVisible = !!details && (
    view.phase === 'consentReady'
    || view.phase === 'consentSubmitting'
    || view.phase === 'consentSubmissionError'
  );
  const displayedScopes = verifiedDetailsVisible ? details.scopes.filter((scope) => scopeLabels[scope]) : [];
  const clientName = details?.clientName || 'OAuth client';
  const isSubmitting = view.phase === 'consentSubmitting';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Surface mode={mode} style={styles.surface}>
          <Badge mode={mode}>OAuth access request</Badge>
          <Text style={[styles.title, { color: palette.text }]}>
            {verifiedDetailsVisible ? `${clientName} wants to connect` : 'Securely connecting your workspace'}
          </Text>
          {verifiedDetailsVisible ? (
            <>
              <Text style={[styles.body, { color: palette.muted }]}>Only approved HASHPASS team accounts can use this private MCP server. Review the exact client and redirect destination before allowing access. Your Plane service credential is never shared with the client.</Text>
              <View style={[styles.clientDetails, { borderColor: palette.border }]} accessibilityLabel="OAuth client identity">
                <Text style={[styles.detailLabel, { color: palette.muted }]}>Client name (self-declared)</Text>
                <Text selectable style={[styles.detailValue, { color: palette.text }]}>{clientName}</Text>
                <Text style={[styles.detailLabel, { color: palette.muted }]}>Client ID</Text>
                <Text selectable style={[styles.detailValue, { color: palette.text }]}>{details.clientId}</Text>
                {!!details.clientUri && (
                  <>
                    <Text style={[styles.detailLabel, { color: palette.muted }]}>Client website</Text>
                    <Text selectable style={[styles.detailValue, { color: palette.text }]}>{details.clientUri}</Text>
                  </>
                )}
                <Text style={[styles.detailLabel, { color: palette.muted }]}>Redirect destination</Text>
                <Text selectable style={[styles.detailValue, { color: palette.text }]}>{details.redirectUri}</Text>
              </View>
              <View style={styles.permissionList} accessibilityRole="list">
                {displayedScopes.map((scope) => (
                  <View key={scope} style={[styles.permission, { borderColor: palette.border }]}>
                    <Text style={[styles.permissionText, { color: palette.text }]}>{scopeLabels[scope]}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : !view.error && (
            <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Checking your HASHPASS session">
              <ActivityIndicator color={palette.accent} />
              <Text style={[styles.body, { color: palette.muted }]}>Checking your HASHPASS session and authorization request…</Text>
            </View>
          )}
          {!!view.error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{view.error}</Text>}
          {view.canRetry && (
            <View style={styles.actions}>
              <ActionButton mode={mode} label="Try again" onPress={() => send({ type: 'RETRY' })} />
            </View>
          )}
          {(view.canSubmitConsent || isSubmitting) && (
            <View style={styles.actions}>
              <ActionButton mode={mode} label="Allow access" loading={isSubmitting} disabled={!view.canSubmitConsent} onPress={() => decide(true)} />
              <ActionButton mode={mode} label="Deny" variant="ghost" disabled={!view.canSubmitConsent} onPress={() => decide(false)} />
            </View>
          )}
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: uiTokens.space.xl },
  surface: { width: '100%', maxWidth: 640, gap: uiTokens.space.lg },
  title: { fontSize: uiTokens.type.heading, lineHeight: 40, fontWeight: '700' },
  body: { fontSize: uiTokens.type.body, lineHeight: 26 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md },
  clientDetails: { borderWidth: uiTokens.control.borderWidth, borderRadius: uiTokens.radius.input, padding: uiTokens.space.lg, gap: uiTokens.space.xs },
  detailLabel: { fontSize: uiTokens.type.caption, lineHeight: 18, fontWeight: '700', marginTop: uiTokens.space.sm },
  detailValue: { fontSize: uiTokens.type.label, lineHeight: 20 },
  permissionList: { gap: uiTokens.space.sm },
  permission: { borderWidth: uiTokens.control.borderWidth, borderRadius: uiTokens.radius.input, padding: uiTokens.space.lg },
  permissionText: { fontSize: uiTokens.type.body, lineHeight: 24 },
  error: { fontSize: uiTokens.type.label, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.md },
});
