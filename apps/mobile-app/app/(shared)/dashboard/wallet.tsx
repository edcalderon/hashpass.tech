import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActionButton, SegmentedTabs } from '@hashpass/ui/primitives';
import { useTheme } from '../../../hooks/useTheme';
import { DASHBOARD_PAGE_MAX_WIDTH, DASHBOARD_PAGE_SIDE_PADDING, useDashboardPageLayout } from '../../../hooks/useDashboardPageLayout';
import { useTranslation } from '../../../i18n/i18n';
import BlockchainTokensView from '../../../components/BlockchainTokensView';
import HashPointsView from '../../../components/HashPointsView';
import BlockchainTicketsView from '../../../components/BlockchainTicketsView';
import WalletEnrollmentView from '../../../components/wallet/WalletEnrollmentView';
import type { State as WalletEnrollmentState } from '../../../components/wallet/WalletEnrollmentView.types';
import WalletVaultFlow from '../../../components/wallet/WalletVaultFlow';
import { walletEnrollmentClient } from '../../../lib/wallet/enrollment-client';
import type { WalletEnrollment } from '../../../lib/wallet/enrollment-types';
import WalletHelpDrawer, { WalletHelpButton } from '../../../components/wallet/WalletHelpDrawer';
import ContactsScreen from '../../../components/contacts/ContactsScreen';
import AuthenticatorFlow from '../../../components/security/AuthenticatorFlow';
import PinFlow from '../../../components/security/PinFlow';
import { useAuth } from '../../../hooks/useAuth';
import { useWalletGuard, WALLET_UNLOCK_SCOPE } from '../../../hooks/useWalletGuard';
import type { ThemeColors } from '../../../lib/theme';
import { uiTokens } from '@hashpass/ui/tokens';
import DashboardNoticeCard from '../../../components/dashboard/DashboardNoticeCard';
import { Ionicons } from '../../../lib/vector-icons';
import { authenticatorStatus } from '../../../lib/authenticator-client';

import type { WalletSection as Section } from '../../../types/authenticator.types';

export default function WalletScreen() {
  // The guard must key on the registry id (dbUserId), the same identity the enrollment row's
  // scope.ownerId uses: proofs are stored per owner, and a guard keyed on the auth provider's
  // own id would have its proof cleared the moment the vault flow stores one under the
  // registry id (rememberProof drops everything when the owner changes).
  const { user, dbUserId, isLoading: authLoading } = useAuth();
  const guard = useWalletGuard(authLoading ? null : dbUserId ?? null);
  return <WalletGate key={dbUserId ?? 'signed-out'} guard={guard} signedIn={!!user} />;
}

function WalletGate({ guard, signedIn }: { guard: ReturnType<typeof useWalletGuard>; signedIn: boolean }) {
  const { colors, isDark } = useTheme();
  const { topInset, bottomInset } = useDashboardPageLayout();
  const { t } = useTranslation('wallet');
  const styles = getStyles(colors);
  const [authenticatorEnabled, setAuthenticatorEnabled] = useState<boolean | null>(null);
  const [authenticatorUnavailable, setAuthenticatorUnavailable] = useState(false);
  const [enrollmentState, setEnrollmentState] = useState<WalletEnrollmentState>({ status: 'loading' });
  const preflightGeneration = useRef(0);
  useEffect(() => {
    if (guard.phase === 'checking') {
      preflightGeneration.current += 1;
      setAuthenticatorEnabled(null);
      setAuthenticatorUnavailable(false);
      setEnrollmentState({ status: 'loading' });
      return;
    }
    if ((guard.phase !== 'locked' && guard.phase !== 'pin_setup') || !signedIn) return;
    const current = ++preflightGeneration.current;
    setAuthenticatorEnabled(null);
    setAuthenticatorUnavailable(false);
    setEnrollmentState({ status: 'loading' });
    void authenticatorStatus()
      .then((status: { enabled: boolean }) => { if (current === preflightGeneration.current) setAuthenticatorEnabled(status.enabled); })
      .catch(() => { if (current === preflightGeneration.current) setAuthenticatorUnavailable(true); });
    void walletEnrollmentClient.load()
      .then((row: WalletEnrollment) => { if (current === preflightGeneration.current) setEnrollmentState({ status: 'ready', row }); })
      .catch((failure: unknown) => {
        if (current === preflightGeneration.current) setEnrollmentState({ status: 'error',
          reason: failure instanceof Error && failure.message === 'wallet_not_enrolled' ? 'not_enrolled' : 'unavailable' });
      });
  }, [guard.phase, signedIn]);
  // The email-code recovery must be reachable from the locked gate: both in-flow recovery
  // entry points sit inside WalletContent, which mounts only after a successful unlock.
  const [recovery, setRecovery] = useState<'idle' | 'authenticator' | 'loading' | 'active' | 'noWallet' | 'unavailable'>('idle');
  const [recoveryRow, setRecoveryRow] = useState<WalletEnrollment | null>(null);
  const startRecovery = useCallback(() => {
    setRecovery('loading');
    // Typed params (not inferred): the isolated changed-file typecheck stubs the enrollment
    // client to `any`, so an unannotated callback would fail it.
    void walletEnrollmentClient.load()
      .then((row: WalletEnrollment) => { setRecoveryRow(row); setRecovery(row.state === 'registered' ? 'active' : 'noWallet'); })
      .catch((failure: unknown) => setRecovery(failure instanceof Error && failure.message === 'wallet_not_enrolled' ? 'noWallet' : 'unavailable'));
  }, []);
  const endRecovery = useCallback(() => setRecovery('idle'), []);
  if (guard.phase === 'unlocked') return <WalletContent pin={guard.pin} authenticatorEnabled={authenticatorEnabled} enrollmentState={enrollmentState} />;
  const shell = (children: React.ReactNode) => <ScrollView style={styles.page} contentContainerStyle={[
    styles.content, { paddingTop: topInset, paddingBottom: bottomInset },
  ]}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{t('overview.eyebrow', 'YOUR HASHPASS')}</Text>
      <Text accessibilityRole="header" style={styles.title}>{t('overview.unifiedTitle', 'Wallet & Contacts')}</Text>
    </View>
    {children}
  </ScrollView>;
  if (!signedIn) return shell(<Text style={styles.body}>{t('enrollment.signIn', 'Sign in to see your wallet status.')}</Text>);
  if (guard.phase === 'checking'
    || ((guard.phase === 'locked' || guard.phase === 'pin_setup') && authenticatorEnabled === null && !authenticatorUnavailable)) {
    return shell(<View accessibilityRole="progressbar" accessibilityLabel={t('guard.unlocking', 'Checking your wallet protection…')} style={styles.transition}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.body}>{t('guard.unlocking', 'Checking your wallet protection…')}</Text>
    </View>);
  }
  if ((guard.phase === 'locked' || guard.phase === 'pin_setup') && authenticatorUnavailable) return shell(<View style={styles.panel}>
    <Text style={styles.body}>{t('guard.unavailable', 'We could not check your wallet protection. Check your connection and try again.')}</Text>
    <Pressable accessibilityRole="button" onPress={guard.retry} style={styles.outlineButton}>
      <Text style={styles.buttonText}>{t('guard.retry', 'Try again')}</Text></Pressable>
  </View>);
  if (guard.phase === 'unavailable') return shell(<View style={styles.panel}>
    <Text style={styles.body}>{t('guard.unavailable', 'We could not check your wallet protection. Check your connection and try again.')}</Text>
    <Pressable accessibilityRole="button" onPress={guard.retry} style={styles.outlineButton}>
      <Text style={styles.buttonText}>{t('guard.retry', 'Try again')}</Text></Pressable>
  </View>);
  const settingUp = guard.phase === 'pin_setup';
  const body = settingUp
    ? t('guard.unifiedSetupBody', 'Choose a 4-digit PIN. Authenticator setup is optional. We recommend an authenticator app for stronger security and wallet PIN recovery.')
    : t('guard.unifiedLockedBody', 'Enter your PIN to open Wallet & Contacts. If you have not enrolled an authenticator, we recommend one for stronger security and PIN recovery.');
  return shell(<View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{settingUp ? t('guard.unifiedSetupTitle', 'Set up your PIN') : t('guard.unifiedLockedTitle', 'Wallet & Contacts locked')}</Text>
    <Text style={styles.body}>{body}</Text>
    {recovery === 'authenticator' ? <><AuthenticatorFlow scope="critical" onDone={startRecovery} onUnenrolled={startRecovery} /><ActionButton mode={isDark ? 'dark' : 'light'} variant="ghost" label={t('guard.backToPin', 'Back to PIN entry')} onPress={endRecovery} /></> : recovery === 'active' && recoveryRow
      ? // Recovery mounted before the unlock: only the email-code flow runs here, never the
        // wallet's home, so a locked-out person still has a way back in (see WalletVaultFlow).
        <WalletVaultFlow enrollment={recoveryRow} recoverOnly onChanged={endRecovery} onExit={endRecovery} />
      : recovery === 'loading'
        ? <Text style={styles.body}>{t('guard.recoveryChecking', 'Checking your wallet…')}</Text>
        : recovery === 'noWallet'
          ? <View>
              <Text style={styles.body}>{t('guard.recoveryNoWallet', 'This account has no wallet yet, so there is nothing to recover. Your PIN protects your account; contact support if you cannot sign in.')}</Text>
              <Pressable accessibilityRole="button" onPress={endRecovery} style={styles.outlineButton}>
                <Text style={styles.buttonText}>{t('guard.backToPin', 'Back to PIN entry')}</Text></Pressable>
            </View>
          : recovery === 'unavailable'
            ? <View>
                <Text style={styles.body}>{t('guard.recoveryUnavailable', 'We could not reach the PIN recovery service. Check your connection and try again.')}</Text>
                <Pressable accessibilityRole="button" onPress={endRecovery} style={styles.outlineButton}>
                  <Text style={styles.buttonText}>{t('guard.backToPin', 'Back to PIN entry')}</Text></Pressable>
              </View>
            : <>
                <PinFlow mode={isDark ? 'dark' : 'light'} pin={guard.pin} scope={WALLET_UNLOCK_SCOPE}
                  authenticatorScope="access" authenticatorEnabled={authenticatorEnabled} intent={settingUp ? 'create' : 'unlock'}
                  onAuthenticatorComplete={(completion) => setAuthenticatorEnabled(completion === 'authenticator')}
                  onDone={guard.onPinDone} />
                {/* The recovery path is offered exactly where it is needed: at the PIN entry of a
                    person who cannot enter a PIN they never knew or no longer remember. */}
                {!settingUp && <Pressable accessibilityRole="button" accessibilityLabel={t('guard.forgotPin', 'I forgot my PIN')}
                  onPress={() => setRecovery('authenticator')} style={styles.outlineButton}>
                  <Text style={styles.buttonText}>{t('guard.forgotPin', 'I forgot my PIN')}</Text>
                </Pressable>}
              </>
          }
  </View>);
}

function WalletContent({ pin, authenticatorEnabled, enrollmentState }: {
  pin: ReturnType<typeof useWalletGuard>['pin'];
  authenticatorEnabled: boolean | null;
  enrollmentState: WalletEnrollmentState;
}) {
  const params = useLocalSearchParams<{ section?: string; inviteCode?: string }>();
  const { colors, isDark } = useTheme();
  const { topInset, bottomInset } = useDashboardPageLayout();
  const { t } = useTranslation('wallet');
  const router = useRouter();
  const [section, setSection] = useState<Section>(params.section === 'contacts' ? 'contacts' : 'assets');
  const [showSecurity, setShowSecurity] = useState(false);
  const [showAuthenticatorReminder, setShowAuthenticatorReminder] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const styles = getStyles(colors);
  const tabs: { id: Section; label: string }[] = [
    { id: 'contacts', label: t('overview.contacts', 'Contacts') },
    { id: 'assets', label: t('overview.assets', 'Assets') },
    { id: 'rewards', label: t('overview.rewards', 'Rewards') },
    { id: 'passes', label: t('overview.passes', 'Event passes') },
  ];
  const inviteCode = typeof params.inviteCode === 'string' ? params.inviteCode : undefined;

  useEffect(() => {
    if (params.section === 'passes' || params.section === 'contacts') setSection(params.section);
  }, [params.section]);

  return <View style={styles.page}>
    <ScrollView style={section === 'contacts' ? { flexGrow: 0, flexShrink: 0 } : undefined} contentContainerStyle={[
      styles.content, { paddingTop: topInset, paddingBottom: bottomInset },
    ]}>
    <View style={styles.heading}>
      <Text style={styles.eyebrow}>{t('overview.eyebrow', 'YOUR HASHPASS')}</Text>
      <Text accessibilityRole="header" style={styles.title}>{t('overview.unifiedTitle', 'Wallet & Contacts')}</Text>
      <Text style={styles.body}>{t('overview.unifiedSubtitle', 'Your contacts, assets, rewards and event passes. A PIN protects wallet access; an authenticator adds another step when enabled.')}</Text>
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
      <WalletEnrollmentView key={enrollmentState.status} pin={pin} initialState={enrollmentState} />
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('overview.activity', 'Recent activity')}</Text>
        <View style={styles.transactionEmpty}>
          <View style={styles.transactionIcon}><Text style={styles.transactionLabel}>{t('overview.transactionNone', 'No transactions yet')}</Text></View>
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
    {authenticatorEnabled === false && showAuthenticatorReminder ? (
      <DashboardNoticeCard
        mode={isDark ? 'dark' : 'light'}
        style={[styles.authenticatorReminder, { bottom: bottomInset + 16 }]}
        onDismiss={() => setShowAuthenticatorReminder(false)}
        dismissLabel={t('guard.dismissAuthenticatorReminder', 'Dismiss authenticator reminder')}
        testID="authenticator-reminder"
      >
        <View style={styles.reminderContent}>
          <View style={styles.reminderIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.reminderCopy}>
            <Text accessibilityRole="header" style={styles.reminderTitle}>
              {t('guard.authenticatorRecommendedTitle', 'Authenticator recommended')}
            </Text>
            <Text style={styles.reminderBody}>
              {t('guard.authenticatorRecommendedBody', 'PIN-only access is active. Add an authenticator for stronger security and easier PIN recovery.')}
            </Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('guard.authenticatorSetupCta', 'Set up two-step verification')}
              onPress={() => router.push('/dashboard/profile-settings?shortcut=authenticator' as any)}
              style={styles.reminderLink}
            >
              <Text style={styles.reminderLinkText}>{t('guard.authenticatorSetupCta', 'Set up two-step verification')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </DashboardNoticeCard>
    ) : null}
    {section === 'contacts' && <ContactsScreen />}
    <WalletHelpButton onPress={() => setHelpOpen(true)} />
    <WalletHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
  </View>;
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background.default, position: 'relative' },
  content: { width: '100%', maxWidth: DASHBOARD_PAGE_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: DASHBOARD_PAGE_SIDE_PADDING, gap: 24 },
  heading: { gap: 8 },
  eyebrow: { color: colors.text.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.text.primary, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  body: { color: colors.text.secondary, fontSize: 14, lineHeight: 23 },
  transition: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 44 },
  stack: { gap: 20 },
  securityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  securityHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  securityIcon: { width: 36, height: 36, borderRadius: uiTokens.radius.input, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  securityIconGlyph: { fontSize: 16 },
  learnMore: { minHeight: 44, justifyContent: 'center' },
  learnMoreText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  outlineButton: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 24, borderWidth: 1, borderColor: colors.divider },
  buttonText: { color: colors.text.primary, fontSize: 14, fontWeight: '600' },
  security: { gap: 20, paddingTop: 8 },
  securityStep: { gap: 5 },
  panel: { padding: 24, borderWidth: 1, borderColor: colors.divider, borderRadius: 20, gap: 12 },
  authenticatorReminder: {
    position: 'absolute',
    left: DASHBOARD_PAGE_SIDE_PADDING,
    right: DASHBOARD_PAGE_SIDE_PADDING,
    alignSelf: 'center',
    maxWidth: 520,
    elevation: 8,
    zIndex: 20,
  },
  reminderContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reminderIcon: {
    width: 36,
    height: 36,
    borderRadius: uiTokens.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.default,
  },
  reminderCopy: { flex: 1, gap: 4 },
  reminderTitle: { color: colors.text.primary, fontSize: 14, fontWeight: '700' },
  reminderBody: { color: colors.text.secondary, fontSize: 13, lineHeight: 19 },
  reminderLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4 },
  reminderLinkText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  sectionTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '600' },
  transactionEmpty: { gap: 12, alignItems: 'center', paddingVertical: 18, borderTopWidth: 1, borderColor: colors.divider, marginTop: 4 },
  transactionIcon: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  transactionLabel: { color: colors.text.primary, fontSize: 12, fontWeight: '700' },
});
