import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SegmentedTabs } from '@hashpass/ui/primitives';
import { useTheme } from '../../../hooks/useTheme';
import { DASHBOARD_PAGE_MAX_WIDTH, DASHBOARD_PAGE_SIDE_PADDING, useDashboardPageLayout } from '../../../hooks/useDashboardPageLayout';
import { useTranslation } from '../../../i18n/i18n';
import BlockchainTokensView from '../../../components/BlockchainTokensView';
import HashPointsView from '../../../components/HashPointsView';
import BlockchainTicketsView from '../../../components/BlockchainTicketsView';
import WalletEnrollmentView from '../../../components/wallet/WalletEnrollmentView';
import WalletHelpDrawer, { WalletHelpButton } from '../../../components/wallet/WalletHelpDrawer';
import PinFlow from '../../../components/security/PinFlow';
import { useAuth } from '../../../hooks/useAuth';
import { useWalletGuard, WALLET_UNLOCK_SCOPE } from '../../../hooks/useWalletGuard';
import type { ThemeColors } from '../../../lib/theme';

type Section = 'assets' | 'rewards' | 'passes';
const NETWORKS = [
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'SOL', name: 'Solana' },
] as const;

export default function WalletScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const guard = useWalletGuard(authLoading ? null : user?.id ?? null);
  return <WalletGate guard={guard} signedIn={!!user} />;
}

function WalletGate({ guard, signedIn }: { guard: ReturnType<typeof useWalletGuard>; signedIn: boolean }) {
  const { colors, isDark } = useTheme();
  const { topInset, bottomInset } = useDashboardPageLayout();
  const { t } = useTranslation('wallet');
  const styles = getStyles(colors);
  if (guard.phase === 'unlocked') return <WalletContent />;
  const shell = (children: React.ReactNode) => <ScrollView style={styles.page} contentContainerStyle={[
    styles.content, { paddingTop: topInset, paddingBottom: bottomInset },
  ]}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{t('overview.eyebrow', 'YOUR HASHPASS')}</Text>
      <Text accessibilityRole="header" style={styles.title}>{t('overview.title', 'Wallet')}</Text>
    </View>
    {children}
  </ScrollView>;
  if (!signedIn) return shell(<Text style={styles.body}>{t('enrollment.signIn', 'Sign in to see your wallet status.')}</Text>);
  if (guard.phase === 'checking') return shell(<Text style={styles.body}>{t('guard.unlocking', 'Checking your wallet protection…')}</Text>);
  if (guard.phase === 'unavailable') return shell(<View style={styles.panel}>
    <Text style={styles.body}>{t('guard.unavailable', 'We could not check your wallet protection. Check your connection and try again.')}</Text>
    <Pressable accessibilityRole="button" onPress={guard.retry} style={styles.outlineButton}>
      <Text style={styles.buttonText}>{t('guard.retry', 'Try again')}</Text></Pressable>
  </View>);
  const settingUp = guard.phase === 'pin_setup';
  return shell(<View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{settingUp ? t('guard.pinSetupTitle', 'Protect your wallet with a PIN') : t('guard.lockedTitle', 'Wallet locked')}</Text>
    <Text style={styles.body}>{settingUp
      ? t('guard.pinSetupBody', 'Choose a 4-digit PIN. It is asked every time you open your wallet and before every sensitive action. HASHPASS cannot recover it for you.')
      : t('guard.lockedBody', 'Enter your PIN to open your wallet.')}</Text>
    <PinFlow mode={isDark ? 'dark' : 'light'} pin={guard.pin} scope={WALLET_UNLOCK_SCOPE}
      intent={settingUp ? 'create' : 'unlock'} onDone={guard.onPinDone} />
  </View>);
}

function WalletContent() {
  const params = useLocalSearchParams<{ section?: string; inviteCode?: string }>();
  const { colors, isDark } = useTheme();
  const { topInset, bottomInset } = useDashboardPageLayout();
  const { t } = useTranslation('wallet');
  const [section, setSection] = useState<Section>('assets');
  const [showSecurity, setShowSecurity] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const styles = getStyles(colors);
  const tabs: { id: Section; label: string }[] = [
    { id: 'assets', label: t('overview.assets', 'Assets') },
    { id: 'rewards', label: t('overview.rewards', 'Rewards') },
    { id: 'passes', label: t('overview.passes', 'Event passes') },
  ];
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : undefined;

  useEffect(() => {
    if (params.section === 'passes') setSection('passes');
  }, [params.section]);

  return <View style={styles.page}>
    <ScrollView contentContainerStyle={[
      styles.content, { paddingTop: topInset, paddingBottom: bottomInset },
    ]}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{t('overview.eyebrow', 'YOUR HASHPASS')}</Text>
      <Text accessibilityRole="header" style={styles.title}>{t('overview.title', 'Wallet')}</Text>
      <Text style={styles.body}>{t('overview.subtitle', 'Your assets, rewards and event passes. One place, clear ownership.')}</Text>
    </View>
    <SegmentedTabs
      mode={isDark ? 'dark' : 'light'}
      tabs={tabs}
      value={section}
      onChange={setSection}
      accentColor={colors.primary}
      surfaceColor={colors.background.paper}
    />

    {section === 'assets' && <View style={styles.stack}>
      {/* Balance, send/receive, status and the PIN-protected vault flow all live in this
          one card (WalletEnrollmentView) — one unified section, not two stacked panels. */}
      <WalletEnrollmentView />
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('overview.networks', 'Planned networks')}</Text>
        <Text style={styles.body}>{t('overview.networksDescription', 'Balances will appear after wallet setup and a successful network connection.')}</Text>
        {NETWORKS.map(network => <View key={network.symbol} style={styles.network}>
          <View style={styles.networkIcon}><Text style={styles.networkSymbol}>{network.symbol}</Text></View>
          <View style={styles.networkInfo}><Text style={styles.sectionTitle}>{network.name}</Text>
            <Text style={styles.small}>{t('overview.notConnected', 'Not connected')}</Text></View>
          <Text accessibilityLabel={t('overview.balanceUnavailable', 'Balance unavailable')} style={styles.balance}>—</Text>
        </View>)}
      </View>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('overview.activity', 'Recent activity')}</Text>
        <View style={styles.transactionEmpty}>
          <View style={styles.transactionIcon}><Text style={styles.networkSymbol}>{t('overview.transactionNone', 'No transactions yet')}</Text></View>
          <Text style={styles.body}>{t('overview.activityUnavailable', 'Transaction history will be available when your wallet is connected. No on-chain activity has been loaded.')}</Text>
        </View>
      </View>
      {/* Security lives at the bottom of the view: a proper section header with an icon,
          and a "Learn more" link that opens the in-app help drawer. */}
      <View style={styles.panel}>
        <View style={styles.securityHeader}>
          <View style={styles.securityHeading}>
            <View style={styles.securityIcon}><Text style={styles.securityIconGlyph}>{"\u{1F512}"}</Text></View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{t('overview.securityTitle', 'Security')}</Text>
          </View>
          <Pressable accessibilityRole="link" accessibilityLabel={t('overview.learnMore', 'Learn more about wallet security')}
            onPress={() => setHelpOpen(true)} style={styles.learnMore}>
            <Text style={styles.learnMoreText}>{t('overview.learnMore', 'Learn more')} →</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showSecurity }}
          onPress={() => setShowSecurity(value => !value)} style={styles.outlineButton}>
          <Text style={styles.buttonText}>{showSecurity ? t('overview.hideSecurity', 'Hide security details') : t('overview.showSecurity', 'How wallet protection will work')}</Text>
        </Pressable>
        {showSecurity && <View style={styles.security}>
          {[
            [t('overview.protectTitle', '01 / Protect your wallet'), t('overview.protectBody', 'A separate wallet password will protect signing. Signing stays locked until setup and recovery checks are complete.')],
            [t('overview.backupTitle', '02 / Back up and verify'), t('overview.backupBody', 'Save your recovery phrase and encrypted backup, then complete a recovery check before enabling transactions.')],
            [t('overview.hardwareTitle', '03 / Choose how you sign'), t('overview.hardwareBody', 'Hardware wallet connections are planned. A hardware wallet keeps its keys on the device; never enter its recovery phrase here.')],
          ].map(([title, body]) => <View key={title} style={styles.securityStep}>
            <Text style={styles.sectionTitle}>{title}</Text><Text style={styles.body}>{body}</Text>
          </View>)}
        </View>}
      </View>
    </View>}
    {section === 'rewards' && <View style={styles.stack}><BlockchainTokensView /><HashPointsView /></View>}
    {section === 'passes' && <View style={styles.stack}>
      <Text style={styles.body}>{t('overview.passesNote', 'Your event access passes. These are separate from on-chain assets.')}</Text>
      <BlockchainTicketsView businessInviteCode={inviteCode} />
    </View>}
    </ScrollView>
    <WalletHelpButton onPress={() => setHelpOpen(true)} />
    <WalletHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
  </View>;
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background.default },
  content: { width: '100%', maxWidth: DASHBOARD_PAGE_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: DASHBOARD_PAGE_SIDE_PADDING, gap: 24 },
  heading: { gap: 8 },
  eyebrow: { color: colors.text.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text.primary, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  body: { color: colors.text.secondary, fontSize: 14, lineHeight: 23 },
  stack: { gap: 20 },
  securityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  securityHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  securityIcon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  securityIconGlyph: { fontSize: 16 },
  learnMore: { minHeight: 44, justifyContent: 'center' },
  learnMoreText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  outlineButton: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.divider },
  buttonText: { color: colors.text.primary, fontSize: 14, fontWeight: '600' },
  security: { gap: 20, paddingTop: 8 },
  securityStep: { gap: 5 },
  panel: { padding: 24, borderWidth: 1, borderColor: colors.divider, borderRadius: 20, gap: 12 },
  sectionTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '600' },
  network: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderTopWidth: 1, borderColor: colors.divider },
  networkIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.background.paper, alignItems: 'center', justifyContent: 'center' },
  networkSymbol: { color: colors.text.primary, fontSize: 11, fontWeight: '800' },
  networkInfo: { flex: 1, gap: 3 },
  small: { color: colors.text.secondary, fontSize: 12 },
  balance: { color: colors.text.secondary, fontSize: 24 },
  transactionEmpty: { gap: 12, alignItems: 'center', paddingVertical: 18, borderTopWidth: 1, borderColor: colors.divider, marginTop: 4 },
  transactionIcon: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});
