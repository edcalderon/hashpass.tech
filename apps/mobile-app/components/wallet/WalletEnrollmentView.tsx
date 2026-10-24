import { uiTokens } from '@hashpass/ui/tokens';
import { ActionButton } from '@hashpass/ui/primitives';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { walletEnrollmentClient } from '../../lib/wallet/enrollment-client';
import WalletVaultFlow, { type VaultCommand } from './WalletVaultFlow';
import { MaterialIcons } from '../../lib/vector-icons';
import type { WalletEnrollment } from '../../lib/wallet/enrollment-types';
import type { State } from './WalletEnrollmentView.types';

/**
 * The wallet's single overview card: balance, send/receive actions, enrollment status and
 * the PIN-protected vault flow all live in one section. Secondary actions (refresh, export,
 * PIN) sit in the top-right corner behind a refresh icon and a three-dot menu, so the body
 * stays about the balance — not two stacked cards asking the
 * reader to reconcile them. Balances come from chain indexers after the networks are
 * connected; until then the total shows an honest dash, never a fake zero.
 */
export default function WalletEnrollmentView() {
  const { dbUserId, user } = useAuth();
  // Remount before rendering a different account. Late responses are discarded.
  return <Enrollment key={`${user?.id ?? 'signed-out'}:${dbUserId ?? ''}`} accountId={user?.id} />;
}

function Enrollment({ accountId }: { accountId: string | null | undefined }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const mode = isDark ? 'dark' : 'light';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [command, setCommand] = useState<VaultCommand | null>(null);
  const commandCount = useRef(0);
  const request = useRef(0);
  // `quiet` refreshes keep the current card on screen (no spinner swap), so a wizard that is
  // mid-flow, e.g. showing the recovery phrase, is never unmounted by a background update.
  const load = useCallback(async (quiet = false) => {
    if (!accountId) return;
    const current = ++request.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const row = await walletEnrollmentClient.load();
      if (current !== request.current) return;
      // The authenticated API resolves public.user.id; auth/provider IDs are a separate namespace.
      // Account remount and request invalidation prevent accepting an old account response.
      setState({ status: 'ready', row });
    } catch (failure) {
      if (current === request.current && !quiet) {
        // "No wallet record for this account" (provisioning drift) is not an outage: it
        // needs provisioning, not a retry, so it gets its own message.
        setState({ status: 'error',
          reason: failure instanceof Error && failure.message === 'wallet_not_enrolled' ? 'not_enrolled' : 'unavailable' });
      }
    }
  }, [accountId]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  const row = state.status === 'ready' ? state.row : null;
  const wallet = row?.wallet;
  const hasWallet = row?.state === 'registered';
  const canManage = hasWallet && !!row?.setupEnabled;
  const styles = getStyles();
  const body = { color: colors.text.secondary, ...styles.body };
  const issue = (type: VaultCommand['type']) => { setMenuOpen(false); setCommand({ type, nonce: ++commandCount.current }); };
  const menu = [
    { id: 'REVEAL' as const, icon: 'file-download', label: t('menu.export', 'Export recovery phrase') },
    { id: 'CHANGE' as const, icon: 'lock-outline', label: t('menu.changePin', 'Change PIN') },
    { id: 'RECOVER' as const, icon: 'help-outline', label: t('menu.forgotPin', 'I forgot my PIN') },
  ];
  const status = !row ? null
    : hasWallet ? { tone: 'ok' as const, text: t('enrollment.statusActive', 'Wallet active') }
    : row.state === 'provisioning' ? { tone: 'warn' as const, text: t('enrollment.statusIncomplete', 'Setup incomplete') }
    : { tone: 'idle' as const, text: t('enrollment.statusNotCreated', 'No wallet yet') };
  const statusColor = status?.tone === 'ok' ? '#187548' : status?.tone === 'warn' ? '#b45309' : colors.text.secondary;

  return <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
    <View style={styles.topRow}>
      <View style={[styles.badge, { borderColor: colors.divider }]}>
        <MaterialIcons name="lock-outline" size={12} color={colors.text.secondary} />
        <Text style={[styles.badgeText, { color: colors.text.secondary }]}>{t('enrollment.readOnly', 'READ ONLY')}</Text>
      </View>
      <View style={styles.topActions}>
        {row && <Pressable accessibilityRole="button" accessibilityLabel={t('enrollment.refresh', 'Refresh wallet status')}
          hitSlop={6} onPress={() => { setMenuOpen(false); void load(true); }} style={styles.iconButton}>
          <MaterialIcons name="refresh" size={20} color={colors.text.secondary} />
        </Pressable>}
        {canManage && <Pressable accessibilityRole="button" accessibilityLabel={t('menu.more', 'More wallet actions')}
          accessibilityState={{ expanded: menuOpen }} hitSlop={6} onPress={() => setMenuOpen(open => !open)} style={styles.iconButton}>
          <MaterialIcons name="more-vert" size={20} color={colors.text.secondary} />
        </Pressable>}
      </View>
    </View>
    {menuOpen && canManage && <View accessibilityRole={'menu' as never}
      style={[styles.menu, { backgroundColor: colors.background.default, borderColor: colors.divider }]}>
      {menu.map(item => <Pressable key={item.id} accessibilityRole={'menuitem' as never} accessibilityLabel={item.label}
        onPress={() => issue(item.id)} style={styles.menuItem}>
        <MaterialIcons name={item.icon} size={18} color={colors.text.secondary} />
        <Text style={[styles.menuText, { color: colors.text.primary }]}>{item.label}</Text>
      </Pressable>)}
    </View>}
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]}>{t('overview.ownershipTitle', 'Your wallet. Your control.')}</Text>

    {/* General balance + send/receive, unified with the status below in one card. */}
    <View style={styles.balanceBlock}>
      <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.totalBalance', 'Total balance')}</Text>
      <Text style={[styles.total, { color: colors.text.primary }]}>{t('overview.balancePlaceholder', '—')}</Text>
      <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.testnetNote', 'Test networks. Balances appear after your wallet is connected.')}</Text>
    </View>
    <View style={styles.actionRow}>
      <View style={styles.actionColumn}>
        <ActionButton mode={mode} disabled label={t('overview.send', 'Send')}
          leadingIcon={<MaterialIcons name="north-east" size={18} color="#FFFFFF" />} />
      </View>
      <View style={styles.actionColumn}>
        <ActionButton mode={mode} variant="secondary" label={t('overview.receive', 'Receive')}
          leadingIcon={<MaterialIcons name="south-west" size={18} color={mode === 'dark' ? '#22d3ee' : '#af0d01'} />}
          onPress={() => setReceiveOpen(open => !open)} />
      </View>
    </View>
    <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.sendNote', 'Sending arrives with signed transactions after the security rollout.')}</Text>
    {receiveOpen && (wallet ? <View style={[styles.receivePanel, { borderTopColor: colors.divider }]}>
      {(['ethereum', 'bitcoin', 'solana'] as const).map(chain => <View key={chain} style={styles.chainRow}>
        <View style={[styles.chainIcon, { borderColor: colors.divider }]}>
          <Text style={[styles.chainSymbol, { color: colors.text.primary }]}>
            {chain === 'ethereum' ? 'ETH' : chain === 'bitcoin' ? 'BTC' : 'SOL'}</Text>
        </View>
        <View style={styles.chainInfo}>
          <Text style={[styles.chainName, { color: colors.text.primary }]}>{chain === 'ethereum' ? 'Ethereum' : chain === 'bitcoin' ? 'Bitcoin' : 'Solana'}</Text>
          <Text selectable style={[styles.small, { color: colors.text.secondary }]}>{wallet[chain].address}</Text>
        </View>
      </View>)}
      <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.receiveDisclaimer', 'HASHPASS cannot recover funds sent on wrong networks. Check the address and network before sending.')}</Text>
    </View> : <View style={[styles.receivePanel, { borderTopColor: colors.divider }]}>
      <Text style={body}>{row
        ? t('overview.receiveNoWallet', 'Set up your wallet below to get your receiving addresses for Ethereum, Bitcoin and Solana.')
        : t('overview.receivePending', 'Your receiving addresses for Ethereum, Bitcoin and Solana appear once your wallet is set up.')}</Text>
      {row?.setupEnabled && row.state !== 'registered' && <ActionButton mode={mode} label={t('overview.setUp', 'Set up wallet')}
        onPress={() => { setReceiveOpen(false); issue('CREATE'); }} />}
    </View>)}

    <View accessibilityLiveRegion="polite" style={[styles.stack, { borderTopColor: colors.divider }]}>
      {status && <View style={styles.statusRow}>
        <MaterialIcons name={status.tone === 'ok' ? 'check-circle' : status.tone === 'warn' ? 'error-outline' : 'info-outline'} size={16} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]}>{status.text}</Text>
      </View>}
      {!accountId ? <Text style={body}>{t('enrollment.signIn', 'Sign in to see your wallet status.')}</Text>
        : state.status === 'loading' ? <ActivityIndicator color={colors.primary} accessibilityLabel={t('enrollment.loading', 'Loading wallet status')} />
        : state.status === 'error' ? <>
          <Text style={body}>{state.reason === 'not_enrolled'
            ? t('enrollment.notEnrolled', 'Your account is missing its wallet record. Wallet setup cannot start until it is provisioned — contact HASHPASS support.')
            : t('enrollment.unavailable', 'Wallet status unavailable. Please try again.')}</Text>
          {/* A failed status check never leaves the card without an action: the setup wizard
              can only render once a row loads, so this is the retry that can bring it back. */}
          {state.reason === 'unavailable' && <ActionButton mode={mode} label={t('enrollment.tryAgain', 'Try again')}
            onPress={() => { void load(); }} />}
        </>
        : row?.state === 'enrolled' ? <>
          <Text style={[styles.subtitle, { color: colors.text.primary }]}>{t('enrollment.ready', 'Enrollment ready')}</Text>
          <Text style={body}>{row.setupEnabled ? t('enrollment.setupReady', 'Your account is enrolled. No keys have been created. Set up this device below.') : t('enrollment.noKeys', 'Your account is enrolled. No keys have been created. Device setup and recovery verification are not yet available in this app.')}</Text>
        </> : row?.state === 'provisioning' ? <Text style={body}>{t('enrollment.interrupted', 'Wallet setup is incomplete. Keep the original device and its stored wallet. Do not create a replacement wallet.')}</Text>
        : wallet ? <>
          <Text style={[styles.subtitle, { color: colors.text.primary }]}>{wallet.network === 'testnet' ? t('enrollment.testnet', 'Test networks') : t('enrollment.mainnet', 'Main networks')}</Text>
          <Text style={body}>{t('enrollment.registered', 'Registered public addresses. Device access and recovery have not been verified on this screen. Balances and signing are unavailable.')}</Text>
        </> : null}
    </View>
    {row && <WalletVaultFlow enrollment={row} command={command}
      onReload={() => { void load(); }} onChanged={() => { void load(true); }} />}
  </View>;
}
const getStyles = () => StyleSheet.create({
  card: { padding: 20, borderRadius: uiTokens.radius.card, borderWidth: 1, gap: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 36, height: 36, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 26, borderRadius: uiTokens.radius.pill, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  menu: { alignSelf: 'flex-end', minWidth: 220, borderRadius: uiTokens.radius.media, borderWidth: 1, paddingVertical: 6, marginTop: -8, zIndex: 10, elevation: 6 },
  menuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  menuText: { fontSize: 14, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  balanceBlock: { gap: 4 },
  subtitle: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 22 },
  stack: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 13, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  total: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionColumn: { flex: 1, alignItems: 'stretch' },
  receivePanel: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  chainIcon: { width: 46, height: 46, borderRadius: uiTokens.radius.media, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chainSymbol: { fontSize: 11, fontWeight: '800' },
  chainInfo: { flex: 1, gap: 3 },
  chainName: { fontSize: 16, fontWeight: '600' },
});
