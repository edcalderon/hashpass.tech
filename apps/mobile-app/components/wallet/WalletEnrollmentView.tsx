import { uiTokens } from '@hashpass/ui/tokens';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { walletEnrollmentClient } from '../../lib/wallet/enrollment-client';
import WalletOnboarding from './WalletOnboarding';
import type { WalletEnrollment } from '../../lib/wallet/enrollment-types';

type State = { status: 'loading' | 'error' } | { status: 'ready'; row: WalletEnrollment };

export default function WalletEnrollmentView() {
  const { dbUserId, user } = useAuth();
  // Remount before rendering a different account. Late responses are discarded.
  return <Enrollment key={`${user?.id ?? 'signed-out'}:${dbUserId ?? ''}`} accountId={user?.id} />;
}

function Enrollment({ accountId }: { accountId: string | null | undefined }) {
  const { colors } = useTheme();
  const { t } = useTranslation('wallet');
  const [state, setState] = useState<State>({ status: 'loading' });
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!accountId) return;
    const current = ++request.current;
    setState({ status: 'loading' });
    try {
      const row = await walletEnrollmentClient.load();
      if (current !== request.current) return;
      // The authenticated API resolves public.user.id; auth/provider IDs are a separate namespace.
      // Account remount and request invalidation prevent accepting an old account response.
      setState({ status: 'ready', row });
    } catch {
      if (current === request.current) setState({ status: 'error' });
    }
  }, [accountId]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  const row = state.status === 'ready' ? state.row : null;
  const wallet = row?.wallet;
  const body = { color: colors.text.secondary, ...styles.body };
  return <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
    <Text style={[styles.badge, { color: colors.text.secondary }]}>{t('enrollment.readOnly', 'READ ONLY')}</Text>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]}>{t('overview.ownershipTitle', 'Your wallet. Your control.')}</Text>
    <View accessibilityLiveRegion="polite" style={styles.stack}>
      {!accountId ? <Text style={body}>{t('enrollment.signIn', 'Sign in to see your wallet status.')}</Text>
        : state.status === 'loading' ? <ActivityIndicator color={colors.primary} accessibilityLabel={t('enrollment.loading', 'Loading wallet status')} />
        : state.status === 'error' ? <Text style={body}>{t('enrollment.unavailable', 'Wallet status unavailable. Please try again.')}</Text>
        : row?.state === 'enrolled' ? <>
          <Text style={[styles.subtitle, { color: colors.text.primary }]}>{t('enrollment.ready', 'Enrollment ready')}</Text>
          <Text style={body}>{row.setupEnabled ? t('enrollment.setupReady', 'Your account is enrolled. No keys have been created. Set up this device below.') : t('enrollment.noKeys', 'Your account is enrolled. No keys have been created. Device setup and recovery verification are not yet available in this app.')}</Text>
        </> : row?.state === 'provisioning' ? <Text style={body}>{t('enrollment.interrupted', 'Wallet setup is incomplete. Keep the original device and its stored wallet. Do not create a replacement wallet.')}</Text>
        : wallet ? <>
          <Text style={[styles.subtitle, { color: colors.text.primary }]}>{wallet.network === 'testnet' ? t('enrollment.testnet', 'Test networks') : t('enrollment.mainnet', 'Main networks')}</Text>
          <Text style={body}>{t('enrollment.registered', 'Registered public addresses. Device access and recovery have not been verified on this screen. Balances and signing are unavailable.')}</Text>
          {(['ethereum', 'bitcoin', 'solana'] as const).map(chain => <View key={chain} style={styles.stack}>
            <Text style={[styles.chain, { color: colors.text.secondary }]}>{chain === 'ethereum' ? 'Ethereum' : chain === 'bitcoin' ? 'Bitcoin' : 'Solana'}</Text>
            <Text selectable style={[styles.address, { color: colors.text.primary }]}>{wallet[chain].address}</Text>
          </View>)}
        </> : null}
    </View>
    {row && <WalletOnboarding enrollment={row} />}
    {accountId && state.status !== 'loading' && <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={[styles.button, { borderColor: colors.divider }]}>
      <Text style={{ color: colors.text.primary }}>{t('enrollment.refresh', 'Refresh wallet status')}</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 24, borderRadius: uiTokens.radius.card, borderWidth: 1, gap: 16 },
  badge: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  subtitle: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 23 },
  stack: { gap: 8 },
  chain: { fontSize: 12, fontWeight: '600' },
  address: { fontSize: 13, lineHeight: 20, flexShrink: 1 },
  button: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: uiTokens.radius.pill, borderWidth: 1 },
});
