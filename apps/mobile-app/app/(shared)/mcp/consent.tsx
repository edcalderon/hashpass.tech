import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAuthClient } from 'better-auth/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { ENV_CONFIG } from '@hashpass/config';
import { ActionButton, Badge, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../../hooks/useTheme';
import { apiClient } from '@/lib/api-client';

type ConsentDetails = {
  clientId: string;
  clientName: string;
  clientUri: string;
  redirectUri: string;
  scopes: string[];
};
type ConsentResponse =
  | { data: ConsentDetails; success: true }
  | { data?: ConsentDetails | null; error: string; success: false };

const scopeLabels: Record<string, string> = {
  'plane:read': 'Read Hashpass projects, milestones, modules, and work items',
  'plane:write': 'Create and update Hashpass planning data after confirmation',
  offline_access: 'Stay connected until you revoke access',
  profile: 'Identify your Hashpass account',
  email: 'Verify that your account is approved for internal access',
};

export default function McpConsentScreen() {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const authBaseUrl = `${ENV_CONFIG.getApiUrl().replace(/\/$/, '')}/auth`;
  const authClient = useMemo(
    () => createAuthClient({ baseURL: authBaseUrl, plugins: [oauthProviderClient()] }),
    [authBaseUrl],
  );
  const authorizationQuery = useMemo(
    () => (typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, '')),
    [],
  );

  useEffect(() => {
    if (!authorizationQuery) {
      setError('This authorization request is missing or has expired.');
      return;
    }

    const request = apiClient.get(`/auth/mcp-consent-query?${authorizationQuery}`, {
      skipEventSegment: true,
    }) as Promise<ConsentResponse>;

    request
      .then((response: ConsentResponse) => {
        if (!response.success) {
          throw new Error(response.error || 'Could not verify this request.');
        }
        if (!response.data) throw new Error('Could not verify this request.');
        setDetails(response.data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not verify this request.'));
  }, [authorizationQuery]);

  const decide = useCallback(async (accept: boolean) => {
    setBusy(true);
    setError('');
    try {
      const result = await (authClient as any).oauth2.consent({
        accept,
        oauth_query: authorizationQuery,
      });
      if (result?.error) throw new Error(result.error.message || 'Authorization failed.');
      const redirect = result?.data?.redirectURI || result?.data?.redirectUri || result?.data?.url;
      if (redirect && typeof window !== 'undefined') window.location.assign(redirect);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authorization failed.');
      setBusy(false);
    }
  }, [authClient, authorizationQuery]);

  const displayedScopes = details?.scopes.filter((scope) => scopeLabels[scope]) || [];
  const clientName = details?.clientName || 'Unnamed OAuth client';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Surface mode={mode} style={styles.surface}>
          <Badge mode={mode}>OAuth access request</Badge>
          <Text style={[styles.title, { color: palette.text }]}>{clientName} wants to connect</Text>
          <Text style={[styles.body, { color: palette.muted }]}>Only approved Hashpass team accounts can use this private MCP server. Review the exact client and redirect destination before allowing access. Your Plane service credential is never shared with the client.</Text>
          {!!details && (
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
          )}
          <View style={styles.permissionList} accessibilityRole="list">
            {displayedScopes.map((scope) => (
              <View key={scope} style={[styles.permission, { borderColor: palette.border }]}>
                <Text style={[styles.permissionText, { color: palette.text }]}>{scopeLabels[scope]}</Text>
              </View>
            ))}
          </View>
          {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>}
          <View style={styles.actions}>
            <ActionButton mode={mode} label="Allow access" loading={busy} disabled={!details} onPress={() => decide(true)} />
            <ActionButton mode={mode} label="Deny" variant="ghost" disabled={busy} onPress={() => decide(false)} />
          </View>
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
  clientDetails: { borderWidth: uiTokens.control.borderWidth, borderRadius: uiTokens.radius.input, padding: uiTokens.space.lg, gap: uiTokens.space.xs },
  detailLabel: { fontSize: uiTokens.type.caption, lineHeight: 18, fontWeight: '700', marginTop: uiTokens.space.sm },
  detailValue: { fontSize: uiTokens.type.label, lineHeight: 20 },
  permissionList: { gap: uiTokens.space.sm },
  permission: { borderWidth: uiTokens.control.borderWidth, borderRadius: uiTokens.radius.input, padding: uiTokens.space.lg },
  permissionText: { fontSize: uiTokens.type.body, lineHeight: 24 },
  error: { fontSize: uiTokens.type.label, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.md },
});
