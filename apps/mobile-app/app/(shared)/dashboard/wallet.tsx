import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../hooks/useTheme';
import { useScroll } from '@contexts/ScrollContext';
import { useTranslation } from '../../../i18n/i18n';
import BlockchainTokensView from '../../../components/BlockchainTokensView';
import HashPointsView from '../../../components/HashPointsView';
import BlockchainTicketsView from '../../../components/BlockchainTicketsView';
import WalletEnrollmentView from '../../../components/wallet/WalletEnrollmentView';
import type { ThemeColors } from '../../../lib/theme';

type Section = 'assets' | 'rewards' | 'passes';
const NETWORKS = [
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'SOL', name: 'Solana' },
] as const;

export default function WalletScreen() {
  const { colors } = useTheme();
  const { headerHeight } = useScroll();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation('wallet');
  const [section, setSection] = useState<Section>('assets');
  const [showSecurity, setShowSecurity] = useState(false);
  const styles = getStyles(colors);
  const tabs: { id: Section; label: string }[] = [
    { id: 'assets', label: t('overview.assets', 'Assets') },
    { id: 'rewards', label: t('overview.rewards', 'Rewards') },
    { id: 'passes', label: t('overview.passes', 'Event passes') },
  ];

  return <ScrollView style={styles.page} contentContainerStyle={[
    styles.content, { paddingTop: Math.max(headerHeight, insets.top + 80) + 24, paddingBottom: insets.bottom + 40 },
  ]}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{t('overview.eyebrow', 'YOUR HASHPASS')}</Text>
      <Text accessibilityRole="header" style={styles.title}>{t('overview.title', 'Wallet')}</Text>
      <Text style={styles.body}>{t('overview.subtitle', 'Your assets, rewards and event passes. One place, clear ownership.')}</Text>
    </View>
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map(tab => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: section === tab.id }}
        onPress={() => setSection(tab.id)} style={[styles.tab, section === tab.id && styles.selectedTab]}>
        <Text style={[styles.tabText, section === tab.id && { color: colors.primaryContrastText }]}>{tab.label}</Text>
      </Pressable>)}
    </View>

    {section === 'assets' && <View style={styles.stack}>
      <WalletEnrollmentView />
      <View style={styles.hero}>
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
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('overview.activity', 'Activity')}</Text>
        <Text style={styles.body}>{t('overview.activityUnavailable', 'Transaction history will be available when your wallet is connected. No on-chain activity has been loaded.')}</Text>
      </View>
    </View>}
    {section === 'rewards' && <View style={styles.stack}><BlockchainTokensView /><HashPointsView /></View>}
    {section === 'passes' && <View style={styles.stack}>
      <Text style={styles.body}>{t('overview.passesNote', 'Your event access passes. These are separate from on-chain assets.')}</Text>
      <BlockchainTicketsView />
    </View>}
  </ScrollView>;
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background.default },
  content: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 20, gap: 24 },
  heading: { gap: 8 },
  eyebrow: { color: colors.text.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text.primary, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  body: { color: colors.text.secondary, fontSize: 14, lineHeight: 23 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignSelf: 'flex-start', padding: 5, borderRadius: 28, backgroundColor: colors.background.paper },
  tab: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 24 },
  selectedTab: { backgroundColor: colors.primary },
  tabText: { color: colors.text.secondary, fontSize: 14, fontWeight: '600' },
  stack: { gap: 20 },
  hero: { padding: 24, borderRadius: 24, backgroundColor: colors.background.paper, borderColor: colors.divider, borderWidth: 1, gap: 16 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.divider, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20 },
  badgeText: { color: colors.text.secondary, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroTitle: { color: colors.text.primary, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
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
});
