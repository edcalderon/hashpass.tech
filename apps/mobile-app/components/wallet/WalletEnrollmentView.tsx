import { uiTokens } from '@hashpass/ui/tokens';
import { ActionButton, Badge, IconButton, ModalBackdrop, SegmentedTabs, Surface } from '@hashpass/ui/primitives';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'react-native-qrcode-svg';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import type { UsePin } from '../../hooks/usePin';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { useToast } from '../../contexts/ToastContext';
import { walletEnrollmentClient } from '../../lib/wallet/enrollment-client';
import { fetchWalletBalanceSnapshot } from '../../lib/wallet/balance-client';
import { openReceiveSocial, sharePublicReceiveDetails } from '../../lib/wallet/share';
import DashboardRefreshButton from '../dashboard/DashboardRefreshButton';
import WalletVaultFlow, { type VaultCommand } from './WalletVaultFlow';
import { MaterialIcons } from '../../lib/vector-icons';
import { PESO_CURRENCY_OPTIONS } from './WalletEnrollmentView.types';
import type { BalanceCurrency, BalanceDisplayMode, BalanceState, PesoCurrency, State, WalletChain, WalletNetwork } from './WalletEnrollmentView.types';

const WALLET_SHARE_ORIGIN = (process.env.EXPO_PUBLIC_LINKS_API_BASE_URL || 'https://hpass.id').replace(/\/$/, '');

/**
 * The wallet's single overview card: balance, send/receive actions, enrollment status and
 * the PIN-protected vault flow all live in one section. Secondary actions (refresh, export,
 * PIN) sit beside the balance and behind the three-dot menu, so the body stays about one
 * source of truth instead of two stacked cards asking the reader to reconcile them.
 * A refresh reads public chain balances and current fiat quotes; until those sources
 * respond, the total stays honest and never becomes a fabricated zero.
 */
export default function WalletEnrollmentView({ pin }: { pin?: UsePin }) {
  const { dbUserId, user } = useAuth();
  // Remount before rendering a different account. Late responses are discarded.
  return <Enrollment key={`${user?.id ?? 'signed-out'}:${dbUserId ?? ''}`} accountId={user?.id} pin={pin} />;
}

function WalletNetworkBadge({ network, connected }: { network: WalletNetwork; connected: boolean }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const mode = isDark ? 'dark' : 'light';
  const statusColor = connected
    ? (colors.success?.main ?? uiTokens.colors.light.success)
    : (colors.warning?.main ?? uiTokens.feature.amber);
  const environmentLabel = network === 'testnet'
    ? t('overview.testnet', 'Testnet')
    : t('overview.mainnet', 'Mainnet');
  return <View
    accessible
    accessibilityRole="text"
    accessibilityLabel={`${environmentLabel}. ${connected
      ? t('overview.networkConnected', 'Connected')
      : t('overview.networkPending', 'Setup pending')}`}
  >
    <Badge
      mode={mode}
      tone="neutral"
      compact
      markerColor={statusColor}
      leadingIcon={<MaterialIcons name={connected ? 'check-circle' : 'schedule'} size={13} color={statusColor} />}
    >
      {environmentLabel} · {connected
        ? t('overview.networkConnected', 'Connected')
        : t('overview.networkPending', 'Setup pending')}
    </Badge>
  </View>;
}

function Enrollment({ accountId, pin }: { accountId: string | null | undefined; pin?: UsePin }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const { showToast } = useToast();
  const mode = isDark ? 'dark' : 'light';
  const [state, setState] = useState<State>({ status: 'loading' });
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [command, setCommand] = useState<VaultCommand | null>(null);
  const [qrChain, setQrChain] = useState<WalletChain | null>(null);
  const [copiedChain, setCopiedChain] = useState<WalletChain | null>(null);
  const [copiedLinkChain, setCopiedLinkChain] = useState<WalletChain | null>(null);
  const [sharedChain, setSharedChain] = useState<WalletChain | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [balanceState, setBalanceState] = useState<BalanceState>({ status: 'idle' });
  const [balanceMode, setBalanceMode] = useState<BalanceDisplayMode>('USD');
  const [balanceCurrency, setBalanceCurrency] = useState<BalanceCurrency>('USD');
  const [pesoMenuOpen, setPesoMenuOpen] = useState(false);
  const commandCount = useRef(0);
  const request = useRef(0);
  const balanceRequest = useRef(0);
  const copyAddressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    showToast({ type, title: message, duration: 2400, inbox: false });
  }, [showToast]);
  const markAddressCopied = useCallback((chain: WalletChain) => {
    if (copyAddressTimer.current) clearTimeout(copyAddressTimer.current);
    setCopiedChain(chain);
    copyAddressTimer.current = setTimeout(() => {
      setCopiedChain(current => current === chain ? null : current);
    }, 2200);
  }, []);
  const markLinkCopied = useCallback((chain: WalletChain) => {
    if (copyLinkTimer.current) clearTimeout(copyLinkTimer.current);
    setCopiedLinkChain(chain);
    copyLinkTimer.current = setTimeout(() => {
      setCopiedLinkChain(current => current === chain ? null : current);
    }, 2200);
  }, []);
  useEffect(() => () => {
    if (copyAddressTimer.current) clearTimeout(copyAddressTimer.current);
    if (copyLinkTimer.current) clearTimeout(copyLinkTimer.current);
  }, []);
  // `quiet` refreshes keep the current card on screen (no spinner swap), so a wizard that is
  // mid-flow, e.g. showing the recovery phrase, is never unmounted by a background update.
  const load = useCallback(async (quiet = false) => {
    if (!accountId) return null;
    const current = ++request.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const row = await walletEnrollmentClient.load();
      if (current !== request.current) return null;
      // The authenticated API resolves public.user.id; auth/provider IDs are a separate namespace.
      // Account remount and request invalidation prevent accepting an old account response.
      setState({ status: 'ready', row });
      return row;
    } catch (failure) {
      if (current === request.current && !quiet) {
        // "No wallet record for this account" (provisioning drift) is not an outage: it
        // needs provisioning, not a retry, so it gets its own message.
        setState({ status: 'error',
          reason: failure instanceof Error && failure.message === 'wallet_not_enrolled' ? 'not_enrolled' : 'unavailable' });
      }
      return null;
    }
  }, [accountId]);
  useEffect(() => { void load(); return () => { request.current++; balanceRequest.current++; }; }, [load]);
  const row = state.status === 'ready' ? state.row : null;
  const wallet = row?.wallet;
  const network = wallet?.network ?? row?.network ?? 'testnet';
  const hasWallet = row?.state === 'registered';
  const canManage = hasWallet && !!row?.setupEnabled;
  const styles = getStyles();
  const body = { color: colors.text.secondary, ...styles.body };
  const issue = (type: VaultCommand['type']) => {
    setMenuOpen(false);
    setNetworkMenuOpen(false);
    setCommand({ type, nonce: ++commandCount.current });
  };
  const menu = [
    { id: 'REVEAL' as const, icon: 'file-download', label: t('menu.export', 'Export recovery phrase') },
    { id: 'CHANGE' as const, icon: 'lock-outline', label: t('menu.changePin', 'Change PIN') },
    { id: 'RECOVER' as const, icon: 'help-outline', label: t('menu.forgotPin', 'I forgot my PIN') },
  ];
  const status = !row ? null
    : hasWallet ? { tone: 'ok' as const, text: t('enrollment.statusActive', 'Wallet active') }
    : row.state === 'provisioning' ? { tone: 'warn' as const, text: t('enrollment.statusIncomplete', 'Setup incomplete') }
    : { tone: 'idle' as const, text: t('enrollment.statusNotCreated', 'No wallet yet') };
  const statusColor = status?.tone === 'ok' ? (colors.success?.main ?? uiTokens.colors.light.success)
    : status?.tone === 'warn' ? (colors.warning?.main ?? uiTokens.feature.amber)
      : colors.text.secondary;
  const loadBalances = useCallback(async (targetWallet: NonNullable<typeof wallet>) => {
    const current = ++balanceRequest.current;
    setBalanceState({ status: 'loading' });
    try {
      const snapshot = await fetchWalletBalanceSnapshot(targetWallet);
      if (current === balanceRequest.current) setBalanceState({ status: 'ready', snapshot });
    } catch {
      if (current === balanceRequest.current) setBalanceState({ status: 'unavailable' });
    }
  }, []);
  const refreshWallet = useCallback(async () => {
    setMenuOpen(false);
    setBalanceState({ status: 'loading' });
    const nextRow = await load(true);
    const targetWallet = nextRow?.wallet ?? wallet;
    if (targetWallet) await loadBalances(targetWallet);
    else setBalanceState({ status: 'unavailable' });
  }, [load, loadBalances, wallet]);
  const formatBalance = (value: number | null) => {
    if (value === null) return t('overview.balanceUnavailable', 'Balance unavailable');
    if (balanceCurrency === 'LKS') {
      return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} $LKS`;
    }
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: balanceCurrency,
        maximumFractionDigits: balanceCurrency === 'USD' ? 2 : 0,
      }).format(value);
    } catch {
      return `${balanceCurrency} ${value.toFixed(balanceCurrency === 'USD' ? 2 : 0)}`;
    }
  };
  const displayedBalance = balanceState.status === 'ready'
    ? balanceState.snapshot.totals[balanceCurrency]
    : null;
  const selectedPeso = PESO_CURRENCY_OPTIONS.find(option => option.code === balanceCurrency) ?? PESO_CURRENCY_OPTIONS[0];
  const selectedPesoIndicator = selectedPeso.symbol.startsWith('$') ? selectedPeso.symbol : `$${selectedPeso.symbol}`;
  const pesoModeLabel = `${t('overview.currencyModePeso', 'PESO')} - ${selectedPesoIndicator}`;
  const pesoLabel = (code: PesoCurrency, fallback: string) => t(`overview.currency${code}`, fallback);
  const switchBalanceMode = (nextMode: BalanceDisplayMode) => {
    if (nextMode === 'USD') {
      setBalanceMode('USD');
      setBalanceCurrency('USD');
      setPesoMenuOpen(false);
      return;
    }
    // The selected PESO segment is also the currency selector. Re-pressing it
    // toggles the floating list; entering PESO from USD opens it immediately.
    if (balanceMode === 'PESO') {
      setPesoMenuOpen(open => !open);
      return;
    }
    setBalanceMode('PESO');
    if (balanceCurrency === 'USD') setBalanceCurrency('LKS');
    setPesoMenuOpen(true);
  };
  const selectPeso = (currency: PesoCurrency) => {
    setBalanceCurrency(currency);
    setPesoMenuOpen(false);
  };
  const selectNetwork = (nextNetwork: WalletNetwork) => {
    // The enrollment API currently provisions testnet only. Keep mainnet
    // visibly locked until a real mainnet enrollment/address set exists; the
    // badge always reflects the server-reported wallet network.
    if (nextNetwork !== network) return;
    setNetworkMenuOpen(false);
  };
  const chainLabel = (chain: WalletChain) => chain === 'ethereum' ? 'Ethereum' : chain === 'bitcoin' ? 'Bitcoin' : 'Solana';
  const networkLabel = network === 'testnet' ? t('overview.testnet', 'Testnet') : t('overview.mainnet', 'Mainnet');
  const walletShareUrl = (chain: WalletChain, address: string) =>
    `${WALLET_SHARE_ORIGIN}/w/${network}/${chain}/${encodeURIComponent(address)}`;
  const copyPublicAddress = useCallback(async (chain: WalletChain, address: string) => {
    const wasAlreadyCopied = copiedChain === chain;
    if (wasAlreadyCopied) {
      if (copyAddressTimer.current) clearTimeout(copyAddressTimer.current);
      setCopiedChain(null);
    }
    try {
      const didCopy = await Clipboard.setStringAsync(address);
      if (didCopy) {
        // A repeated press deliberately restores the original label while still
        // repeating the clipboard write, so the control never gets stuck on
        // “Address copied”.
        if (!wasAlreadyCopied) markAddressCopied(chain);
        notify(t('overview.addressCopied', 'Address copied'));
      } else {
        notify(t('overview.copyFailed', 'Could not copy address.'), 'error');
      }
    } catch {
      setCopiedChain(null);
      notify(t('overview.copyFailed', 'Could not copy address.'), 'error');
    }
  }, [copiedChain, markAddressCopied, notify, t]);
  const copyPublicLink = useCallback(async (chain: WalletChain, address: string) => {
    const wasAlreadyCopied = copiedLinkChain === chain;
    if (wasAlreadyCopied) {
      if (copyLinkTimer.current) clearTimeout(copyLinkTimer.current);
      setCopiedLinkChain(null);
    }
    try {
      const didCopy = await Clipboard.setStringAsync(walletShareUrl(chain, address));
      if (didCopy) {
        if (!wasAlreadyCopied) markLinkCopied(chain);
        notify(t('overview.linkCopied', 'Link copied'));
      } else {
        notify(t('overview.copyFailed', 'Could not copy link.'), 'error');
      }
    } catch {
      setCopiedLinkChain(null);
      notify(t('overview.copyFailed', 'Could not copy link.'), 'error');
    }
  }, [copiedLinkChain, markLinkCopied, network, notify, t]);
  const receiveShareMessage = useCallback((chain: WalletChain, address: string) => {
    return t('overview.receiveShareMessage', `${chainLabel(chain)} receiving address (${networkLabel}):\n${address}\nOnly share this public address. Never share your private key or recovery phrase.`, {
      chain: chainLabel(chain), network: networkLabel, address,
    });
  }, [networkLabel, t]);
  const shareReceiveAddress = useCallback(async (chain: WalletChain, address: string) => {
    const link = walletShareUrl(chain, address);
    const didShare = await sharePublicReceiveDetails({
      title: t('overview.receiveShareTitle', `Receive on ${chainLabel(chain)}`, { chain: chainLabel(chain) }),
      message: receiveShareMessage(chain, address),
      url: link,
    });
    if (didShare) {
      setSharedChain(chain);
      notify(t('overview.sharedReceive', 'Shared'));
    } else {
      setSharedChain(null);
      notify(t('overview.shareFailed', 'Could not open sharing.'), 'error');
    }
  }, [network, notify, receiveShareMessage, t]);
  const shareSocial = useCallback(async (channel: 'whatsapp' | 'telegram' | 'x' | 'linkedin', chain: WalletChain, address: string) => {
    const link = walletShareUrl(chain, address);
    const message = receiveShareMessage(chain, address);
    const encodedLink = encodeURIComponent(link);
    const encodedMessage = encodeURIComponent(`${message}\n${link}`);
    const target = channel === 'whatsapp'
      ? `https://wa.me/?text=${encodedMessage}`
      : channel === 'telegram'
        ? `https://t.me/share/url?url=${encodedLink}&text=${encodeURIComponent(message)}`
        : channel === 'linkedin'
          ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLink}`
          : `https://twitter.com/intent/tweet?text=${encodedMessage}`;
    const didShare = await openReceiveSocial(target);
    if (didShare) {
      setSharedChain(chain);
      notify(t('overview.sharedReceive', 'Shared'));
    } else {
      setSharedChain(null);
      notify(t('overview.shareFailed', 'Could not open sharing.'), 'error');
    }
  }, [network, notify, receiveShareMessage, t]);

  return <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
    <View style={styles.topRow}>
      <View style={styles.topBadges}>
        <Badge mode={mode} tone="neutral" compact leadingIcon={<MaterialIcons name="lock-outline" size={13} color={colors.text.secondary} />}>
          {t('enrollment.readOnly', 'READ ONLY')}
        </Badge>
        {row && (wallet || row.network) && <WalletNetworkBadge network={network} connected={Boolean(wallet)} />}
      </View>
      <View style={styles.topActions}>
        {wallet && <DashboardRefreshButton
          compact
          loading={balanceState.status === 'loading'}
          label={t('overview.refreshBalances', 'Refresh balances')}
          loadingLabel={t('overview.refreshingBalances', 'Refreshing…')}
          hint={t('overview.refreshBalancesHint', 'Fetch the latest wallet balances')}
          onPress={() => { void refreshWallet(); }}
        />}
        {canManage && <IconButton mode={mode} label={t('menu.more', 'More wallet actions')}
          accessibilityState={{ expanded: menuOpen }} onPress={() => setMenuOpen(open => {
            if (open) setNetworkMenuOpen(false);
            return !open;
          })} style={styles.iconButton}>
          <MaterialIcons name="more-vert" size={20} color={colors.text.secondary} />
        </IconButton>}
      </View>
    </View>
    {menuOpen && canManage && <>
      <Pressable accessibilityRole="button" accessibilityLabel={t('menu.close', 'Close wallet actions')}
        onPress={() => setMenuOpen(false)} style={styles.menuDismiss} />
      <View accessibilityRole={'menu' as never}
        style={[
          styles.menu,
          { backgroundColor: colors.background.paper, borderColor: colors.divider },
        ]}>
        <Pressable accessibilityRole={'menuitem' as never} accessibilityLabel={t('menu.network', 'Network')}
          accessibilityState={{ expanded: networkMenuOpen }}
          onPress={() => setNetworkMenuOpen(open => !open)}
          style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed,
            pressed && { backgroundColor: mode === 'dark' ? uiTokens.colors.dark.surface : uiTokens.colors.light.surface }]}
        >
          <View style={[styles.menuIcon, { backgroundColor: mode === 'dark' ? uiTokens.colors.dark.accentSoft : uiTokens.colors.light.accentSoft }]}>
            <MaterialIcons name="language" size={17} color={colors.primary} />
          </View>
          <Text style={[styles.menuText, { color: colors.text.primary }]}>{t('menu.network', 'Network')}</Text>
          <Text style={[styles.menuValue, { color: colors.text.secondary }]}>{network === 'testnet'
            ? t('overview.testnet', 'Testnet')
            : t('overview.mainnet', 'Mainnet')}</Text>
          <MaterialIcons name={networkMenuOpen ? 'expand-less' : 'expand-more'} size={18} color={colors.text.secondary} />
        </Pressable>
        {networkMenuOpen && <View style={[styles.networkSettings, { borderTopColor: colors.divider }]}
          accessibilityRole="radiogroup">
          <Text style={[styles.networkSettingsTitle, { color: colors.text.secondary }]}>{t('menu.networkSettings', 'Network')}</Text>
          {(['testnet', 'mainnet'] as const).map(option => {
            const active = option === network;
            const available = active;
            const label = option === 'testnet'
              ? t('overview.testnet', 'Testnet')
              : t('overview.mainnet', 'Mainnet');
            return <Pressable key={option} accessibilityRole="radio" accessibilityLabel={label}
              accessibilityState={{ selected: active, disabled: !available }} disabled={!available}
              onPress={() => selectNetwork(option)} style={[styles.networkOption,
                {
                  borderColor: active ? colors.primary : colors.divider,
                  backgroundColor: active ? `${colors.primary}14` : 'transparent',
                  opacity: available ? 1 : 0.5,
                }]}
              >
              <MaterialIcons name={active ? 'check-circle' : 'lock-outline'} size={16}
                color={active ? colors.primary : colors.text.secondary} />
              <Text style={[styles.networkOptionLabel, { color: active ? colors.primary : colors.text.secondary }]}>{label}</Text>
              {!available && <Text style={[styles.networkOptionHint, { color: colors.text.secondary }]}>{t('overview.networkUnavailable', 'Unavailable')}</Text>}
            </Pressable>;
          })}
        </View>}
        {menu.map(item => <Pressable key={item.id} accessibilityRole={'menuitem' as never} accessibilityLabel={item.label}
          onPress={() => issue(item.id)} style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed,
            pressed && { backgroundColor: mode === 'dark' ? uiTokens.colors.dark.surface : uiTokens.colors.light.surface }]}>
          <View style={[styles.menuIcon, { backgroundColor: mode === 'dark' ? uiTokens.colors.dark.accentSoft : uiTokens.colors.light.accentSoft }]}>
            <MaterialIcons name={item.icon} size={17} color={colors.primary} />
          </View>
          <Text style={[styles.menuText, { color: colors.text.primary }]}>{item.label}</Text>
          <MaterialIcons name="chevron-right" size={18} color={colors.text.secondary} />
        </Pressable>)}
      </View>
    </>}
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text.primary }]}>{t('overview.ownershipTitle', 'Your wallet. Your control.')}</Text>
    {/* General balance + send/receive, unified with the status below in one card. */}
    <View style={styles.balanceBlock}>
      <View style={styles.balanceHeader}>
        <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.totalBalance', 'Total balance')}</Text>
      </View>
      {!wallet ? <Text style={[styles.total, { color: colors.text.primary }]}>{t('overview.balancePlaceholder', '—')}</Text>
        : balanceState.status === 'loading' ? <View accessibilityLabel={t('overview.balanceLoading', 'Refreshing balances…')} style={styles.skeletonBlock}>
        <View style={[styles.skeletonLarge, { backgroundColor: colors.divider }]} />
        <View style={[styles.skeletonSmall, { backgroundColor: colors.divider }]} />
      </View> : <Text style={[styles.total, { color: colors.text.primary }]}>
        {balanceState.status === 'idle' ? t('overview.balanceUnavailable', 'Balance unavailable') : formatBalance(displayedBalance)}
      </Text>}
      {wallet && <View style={styles.currencyBlock}>
        <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.displayCurrency', 'Display currency')}</Text>
        <View style={styles.currencyPicker}>
          <SegmentedTabs<BalanceDisplayMode> mode={mode} value={balanceMode} onChange={switchBalanceMode}
            accessibilityLabel={t('overview.currencyMode', 'Balance currency mode')}
            tabs={[{ id: 'USD', label: 'USD' }, {
              id: 'PESO',
              label: pesoModeLabel,
              trailingIcon: <MaterialIcons
                name={pesoMenuOpen ? 'expand-less' : 'expand-more'}
                size={18}
                color={balanceMode === 'PESO'
                  ? (isDark ? uiTokens.colors.dark.onAccent : uiTokens.colors.light.onAccent)
                  : colors.text.secondary}
              />,
            }]} />
          {balanceMode === 'PESO' && pesoMenuOpen && <View style={[styles.pesoMenu, { backgroundColor: uiTokens.colors[mode].raised, borderColor: colors.divider }]}
              accessibilityRole="radiogroup">
              <ScrollView style={[styles.pesoMenuScroll, { backgroundColor: uiTokens.colors[mode].raised }]} contentContainerStyle={styles.pesoMenuContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {PESO_CURRENCY_OPTIONS.map(option => {
                  const selected = option.code === balanceCurrency;
                  return <Pressable key={option.code} accessibilityRole="radio" accessibilityLabel={pesoLabel(option.code, option.label)}
                    accessibilityState={{ selected }} onPress={() => selectPeso(option.code)} style={[styles.pesoOption,
                      { backgroundColor: selected ? `${colors.primary}14` : 'transparent' }]}>
                    <Text style={[styles.pesoOptionCode, { color: selected ? colors.primary : colors.text.primary }]}>{option.symbol}</Text>
                    <Text style={[styles.pesoOptionLabel, { color: colors.text.secondary }]} numberOfLines={1}>{pesoLabel(option.code, option.label)}</Text>
                    {selected && <MaterialIcons name="check" size={17} color={colors.primary} />}
                  </Pressable>;
                })}
              </ScrollView>
            </View>}
        </View>
      </View>}
    </View>
    <View style={styles.actionRow}>
      <View style={styles.actionColumn}>
        <ActionButton mode={mode} disabled label={t('overview.send', 'Send')}
          style={styles.walletActionButton}
          leadingIcon={<WalletActionIcon mode={mode} direction="send" />} />
      </View>
      <View style={styles.actionColumn}>
        <ActionButton mode={mode} variant="secondary" label={t('overview.receive', 'Receive')}
          style={styles.walletActionButton}
          leadingIcon={<WalletActionIcon mode={mode} direction="receive" />}
          onPress={() => setReceiveOpen(open => !open)} />
      </View>
    </View>
    <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.sendNote', 'Sending arrives with signed transactions after the security rollout.')}</Text>
    {receiveOpen && (wallet ? <View style={[styles.receivePanel, { borderTopColor: colors.divider }]}>
      {(['ethereum', 'bitcoin', 'solana'] as const).map(chain => <View key={chain} style={styles.chainRow}>
        <View style={[styles.chainIcon, { borderColor: colors.divider }]}>
          <ChainIcon chain={chain} color={colors.primary} />
        </View>
        <View style={styles.chainInfo}>
          <Text style={[styles.chainName, { color: colors.text.primary }]}>{chainLabel(chain)}</Text>
          <Text selectable numberOfLines={1} ellipsizeMode="middle" style={[styles.small, styles.chainAddress, { color: colors.text.secondary }]}>{wallet[chain].address}</Text>
        </View>
        <View style={styles.chainActions}>
          <IconButton mode={mode} size={44}
            label={copiedChain === chain ? t('overview.addressCopied', 'Address copied') : t('overview.copyAddress', 'Copy address')}
            onPress={() => { void copyPublicAddress(chain, wallet[chain].address); }}>
            <MaterialIcons name={copiedChain === chain ? 'check' : 'content-copy'} size={18} color={colors.primary} />
          </IconButton>
          <IconButton mode={mode} size={44} label={t('overview.showQr', `Show ${chainLabel(chain)} QR code`, { chain: chainLabel(chain) })}
            onPress={() => { setShareMenuOpen(false); setQrChain(chain); }}>
            <MaterialIcons name="qr-code" size={18} color={colors.primary} />
          </IconButton>
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

    {qrChain && wallet && <Modal visible transparent animationType="fade" onRequestClose={() => { setShareMenuOpen(false); setQrChain(null); }}>
      <ModalBackdrop mode={mode} style={styles.qrBackdrop}>
        <Surface mode={mode} style={styles.qrDialog} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.qrContent} showsVerticalScrollIndicator={false}>
            <View style={styles.qrHeader}>
              <View style={styles.qrHeading}>
                <Text style={[styles.subtitle, { color: colors.text.primary }]}>{t('overview.receiveQrTitle', `Receive on ${chainLabel(qrChain)}`, { chain: chainLabel(qrChain) })}</Text>
                <Text style={[styles.small, { color: colors.text.secondary }]}>{t('overview.receiveQrHint', 'Scan this code to send funds to this public address.', { chain: chainLabel(qrChain) })}</Text>
              </View>
              <IconButton mode={mode} label={t('overview.closeQr', 'Close QR code')} onPress={() => { setShareMenuOpen(false); setQrChain(null); }}>
                <MaterialIcons name="close" size={20} color={colors.text.secondary} />
              </IconButton>
            </View>
            <View accessible accessibilityRole="image" accessibilityLabel={t('overview.receiveQrLabel', `${chainLabel(qrChain)} receiving QR code`, { chain: chainLabel(qrChain) })} style={[styles.qrFrame, { backgroundColor: colors.background.paper }]}>
              <QRCode value={wallet[qrChain].address} size={220} color={colors.text.primary} backgroundColor={colors.background.paper} quietZone={uiTokens.space.sm} ecl="H" />
            </View>
            <Text selectable numberOfLines={2} ellipsizeMode="middle" style={[styles.qrAddress, { color: colors.text.secondary }]}>{wallet[qrChain].address}</Text>
            <Text selectable numberOfLines={2} ellipsizeMode="middle" accessibilityRole="link" style={[styles.qrShareLink, { color: colors.primary }]}>{walletShareUrl(qrChain, wallet[qrChain].address)}</Text>
            <Text style={[styles.small, styles.qrShareHint, { color: colors.text.secondary }]}>{t('overview.receiveShareHint', 'Share the QR in person or send the public address and its verified HASHPASS link. Private keys and recovery phrases are never included.', { chain: chainLabel(qrChain) })}</Text>
            <View style={styles.qrActions}>
              <ActionButton mode={mode} label={sharedChain === qrChain ? t('overview.sharedReceive', 'Shared') : t('overview.shareReceive', 'Share QR & link')}
                style={styles.qrActionButton}
                leadingIcon={<MaterialIcons name="share" size={18} color={mode === 'dark' ? uiTokens.colors.dark.onAccent : uiTokens.colors.light.onAccent} />}
                onPress={() => { setShareMenuOpen(false); void shareReceiveAddress(qrChain, wallet[qrChain].address); }} />
              <ActionButton mode={mode} variant="secondary"
                style={styles.qrActionButton}
                label={copiedChain === qrChain ? t('overview.addressCopied', 'Address copied') : t('overview.copyAddress', 'Copy address')}
                leadingIcon={<MaterialIcons name={copiedChain === qrChain ? 'check' : 'content-copy'} size={18} color={colors.primary} />}
                onPress={() => { void copyPublicAddress(qrChain, wallet[qrChain].address); }} />
              <View style={styles.shareMenuWrap}>
                <ActionButton mode={mode} variant="secondary"
                  style={styles.qrActionButton}
                  label={t('overview.shareVia', 'More sharing options')}
                  accessibilityState={{ expanded: shareMenuOpen }}
                  leadingIcon={<MaterialIcons name="share" size={18} color={colors.primary} />}
                  trailingIcon={<MaterialIcons name={shareMenuOpen ? 'expand-less' : 'expand-more'} size={18} color={colors.primary} />}
                  onPress={() => setShareMenuOpen(open => !open)} />
                {shareMenuOpen && <View accessibilityRole={'menu' as never}
                  accessibilityLabel={t('overview.socialShareOptions', 'Sharing options')}
                  style={[styles.shareMenu, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                  <Pressable accessibilityRole={'menuitem' as never} accessibilityLabel={t('overview.copyPublicLink', 'Copy public link')}
                    onPress={() => { setShareMenuOpen(false); void copyPublicLink(qrChain, wallet[qrChain].address); }}
                    style={({ pressed }) => [styles.shareMenuItem, pressed && styles.shareMenuItemPressed]}>
                    <MaterialIcons name={copiedLinkChain === qrChain ? 'check' : 'link'} size={18} color={colors.primary} />
                    <Text style={[styles.shareMenuText, { color: colors.text.primary }]}>{copiedLinkChain === qrChain ? t('overview.linkCopied', 'Link copied') : t('overview.copyPublicLink', 'Copy public link')}</Text>
                  </Pressable>
                  <Pressable accessibilityRole={'menuitem' as never} accessibilityLabel="WhatsApp"
                    onPress={() => { setShareMenuOpen(false); void shareSocial('whatsapp', qrChain, wallet[qrChain].address); }}
                    style={({ pressed }) => [styles.shareMenuItem, pressed && styles.shareMenuItemPressed]}>
                    <MaterialIcons name="chat" size={18} color={colors.primary} />
                    <Text style={[styles.shareMenuText, { color: colors.text.primary }]}>WhatsApp</Text>
                  </Pressable>
                  <Pressable accessibilityRole={'menuitem' as never} accessibilityLabel="Telegram"
                    onPress={() => { setShareMenuOpen(false); void shareSocial('telegram', qrChain, wallet[qrChain].address); }}
                    style={({ pressed }) => [styles.shareMenuItem, pressed && styles.shareMenuItemPressed]}>
                    <MaterialIcons name="send" size={18} color={colors.primary} />
                    <Text style={[styles.shareMenuText, { color: colors.text.primary }]}>Telegram</Text>
                  </Pressable>
                  <Pressable accessibilityRole={'menuitem' as never} accessibilityLabel="LinkedIn"
                    onPress={() => { setShareMenuOpen(false); void shareSocial('linkedin', qrChain, wallet[qrChain].address); }}
                    style={({ pressed }) => [styles.shareMenuItem, pressed && styles.shareMenuItemPressed]}>
                    <MaterialIcons name="business" size={18} color={colors.primary} />
                    <Text style={[styles.shareMenuText, { color: colors.text.primary }]}>LinkedIn</Text>
                  </Pressable>
                  <Pressable accessibilityRole={'menuitem' as never} accessibilityLabel="X"
                    onPress={() => { setShareMenuOpen(false); void shareSocial('x', qrChain, wallet[qrChain].address); }}
                    style={({ pressed }) => [styles.shareMenuItem, pressed && styles.shareMenuItemPressed]}>
                    <Text style={[styles.socialGlyph, { color: colors.primary }]}>𝕏</Text>
                    <Text style={[styles.shareMenuText, { color: colors.text.primary }]}>X</Text>
                  </Pressable>
                </View>}
              </View>
            </View>
          </ScrollView>
        </Surface>
      </ModalBackdrop>
    </Modal>}

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
        : wallet ? <Text style={body}>{t('enrollment.registered', 'Registered public addresses. Device access and recovery have not been verified on this screen. Balances and signing are unavailable.')}</Text> : null}
    </View>
    {row && <WalletVaultFlow enrollment={row} pin={pin} command={command}
      onReload={() => { void load(); }} onChanged={() => { void load(true); }} />}
  </View>;
}

function WalletActionIcon({ mode, direction }: { mode: 'light' | 'dark'; direction: 'send' | 'receive' }) {
  const accent = mode === 'dark' ? uiTokens.colors.dark.accent : uiTokens.colors.light.accent;
  const foreground = direction === 'send' ? uiTokens.colors.light.onAccent : accent;
  return <View style={[walletActionIconStyles.actionIcon, {
    backgroundColor: direction === 'send' ? '#ffffff24' : `${accent}14`,
    borderColor: direction === 'send' ? '#ffffff66' : `${accent}52`,
  }]}>
    <MaterialIcons name={direction === 'send' ? 'north-east' : 'south-west'} size={18} color={foreground} />
  </View>;
}

function ChainIcon({ chain, color }: { chain: WalletChain; color: string }) {
  return <MaterialIcons name={chain === 'ethereum' ? 'diamond' : chain === 'bitcoin' ? 'currency-bitcoin' : 'waves'} size={20} color={color} />;
}

const walletActionIconStyles = StyleSheet.create({
  actionIcon: { width: 30, height: 30, borderRadius: uiTokens.radius.circle, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

const getStyles = () => StyleSheet.create({
  card: { padding: 20, borderRadius: uiTokens.radius.card, borderWidth: 1, gap: 16, position: 'relative', overflow: 'visible' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 },
  topBadges: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 36, height: 36, borderRadius: uiTokens.radius.circle, borderWidth: 0, backgroundColor: 'transparent' },
  menuDismiss: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  menu: { position: 'absolute', top: 60, right: 16, minWidth: 244, borderRadius: uiTokens.radius.media, borderWidth: 1, paddingVertical: 8, zIndex: 20, elevation: 12,
    shadowColor: uiTokens.colors.light.text, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 24 },
  menuItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: uiTokens.radius.small },
  menuItemPressed: { opacity: 0.9 },
  menuIcon: { width: 32, height: 32, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
  menuText: { flex: 1, fontSize: 14, fontWeight: '600' },
  menuValue: { fontSize: 12, fontWeight: '700' },
  networkSettings: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingBottom: 8, gap: 8 },
  networkSettingsTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 12 },
  networkOption: { minHeight: 42, borderWidth: 1, borderRadius: uiTokens.radius.input, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8 },
  networkOptionLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
  networkOptionHint: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  balanceBlock: { gap: 4, position: 'relative', zIndex: 30, elevation: 30, overflow: 'visible' },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  skeletonBlock: { gap: 8, paddingVertical: 4 },
  skeletonLarge: { width: 180, height: 40, borderRadius: uiTokens.radius.small, opacity: 0.7 },
  skeletonSmall: { width: 110, height: 14, borderRadius: uiTokens.radius.small, opacity: 0.55 },
  currencyBlock: { gap: 8, marginTop: 6, position: 'relative', zIndex: 100, elevation: 100, overflow: 'visible' },
  currencyPicker: { position: 'relative', zIndex: 100, elevation: 100, overflow: 'visible' },
  pesoMenu: { position: 'absolute', top: 56, left: 0, right: 0, borderRadius: uiTokens.radius.media, borderWidth: 1, paddingVertical: 6, overflow: 'hidden', zIndex: 1000, elevation: 1000,
    shadowColor: uiTokens.colors.light.text, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16 },
  pesoMenuScroll: { maxHeight: 280 },
  pesoMenuContent: { paddingVertical: 0 },
  pesoOption: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: uiTokens.radius.small, marginHorizontal: 6 },
  pesoOptionCode: { minWidth: 38, fontSize: 12, fontWeight: '800' },
  pesoOptionLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  subtitle: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 22 },
  stack: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { fontSize: 13, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  total: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  actionRow: { flexDirection: 'row', gap: uiTokens.space.sm, width: '100%', position: 'relative', zIndex: 0, elevation: 0 },
  actionColumn: { flex: 1, minWidth: 0 },
  walletActionButton: { width: '100%', minHeight: uiTokens.control.minHeight, paddingHorizontal: uiTokens.space.md },
  receivePanel: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chainIcon: { width: 46, height: 46, borderRadius: uiTokens.radius.media, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chainInfo: { flex: 1, minWidth: 0, gap: 3 },
  chainName: { fontSize: 16, fontWeight: '600' },
  chainAddress: { flexShrink: 1 },
  chainActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qrBackdrop: { padding: uiTokens.space.lg },
  qrDialog: { width: '100%', maxWidth: 440, maxHeight: '92%', padding: uiTokens.space.xl, position: 'relative', overflow: 'visible' },
  qrContent: { gap: uiTokens.space.lg },
  qrHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: uiTokens.space.md },
  qrHeading: { flex: 1, gap: uiTokens.space.xs },
  qrFrame: { alignSelf: 'center', padding: uiTokens.space.lg, borderRadius: uiTokens.radius.media, alignItems: 'center', justifyContent: 'center' },
  qrAddress: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'monospace' },
  qrShareLink: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'monospace', flexShrink: 1 },
  qrShareHint: { textAlign: 'center' },
  qrActions: { gap: uiTokens.space.sm },
  qrActionButton: { alignSelf: 'stretch' },
  shareMenuWrap: { position: 'relative', zIndex: 40, elevation: 40, alignSelf: 'stretch' },
  shareMenu: { position: 'absolute', left: 0, right: 0, bottom: 54, borderRadius: uiTokens.radius.media, borderWidth: 1, paddingVertical: 6, zIndex: 60, elevation: 60,
    shadowColor: uiTokens.colors.light.text, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16 },
  shareMenuItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: uiTokens.radius.small },
  shareMenuItemPressed: { opacity: 0.75 },
  shareMenuText: { flex: 1, fontSize: 14, fontWeight: '600' },
  socialGlyph: { fontSize: 16, fontWeight: '700' },
});
