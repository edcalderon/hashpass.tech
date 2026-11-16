import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import AuthenticatorFlow from '../security/AuthenticatorFlow';
import PinFlow from '../security/PinFlow';
import { ActionButton } from '@hashpass/ui/primitives';
import type { ContactsAction } from '../../types/contacts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useContacts } from '../../hooks/useContacts';
import { usePin } from '../../hooks/usePin';
import { useSetup } from '../../hooks/useSetup';
import { useTheme } from '../../hooks/useTheme';
import SetupWizard from '../security/SetupWizard';
import ContactsExperience from './ContactsExperience';

export default function ContactsScreen({ standalone = false }) {
  const { user, dbUserId, isLoading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ card?: string }>();
  const card = typeof params.card === 'string' ? params.card : undefined;
  const network = useContacts(authLoading ? null : user?.id ?? null, card);
  const act = network.act;
  const accountId = authLoading ? null : dbUserId ?? null;
  const setup = useSetup(accountId);
  const pin = usePin(accountId);
  const pinProof = pin.proofFor('wallet:unlock');
  const [pending, setPending] = useState<ContactsAction | null>(null);
  const resolveAction = useRef<((saved: boolean) => void) | null>(null);
  const processingAction = useRef(false);
  const ownerKey = `${user?.id ?? ''}:${accountId ?? ''}`;
  const ownerRef = useRef(ownerKey);
  const returnTo = `/contacts${card ? `?card=${encodeURIComponent(card)}` : ''}`;
  const mode = isDark ? 'dark' : 'light';
  const requestAction = useCallback((action: ContactsAction) => {
    if (resolveAction.current) return Promise.resolve(false);
    setPending(action);
    return new Promise<boolean>(resolve => { resolveAction.current = resolve; });
  }, []);
  const cancelPending = useCallback(() => {
    if (processingAction.current) return;
    const resolve = resolveAction.current;
    resolveAction.current = null;
    setPending(null);
    resolve?.(false);
  }, []);
  const finishPending = useCallback(async () => {
    const action = pending;
    if (!action || processingAction.current) return;
    processingAction.current = true;
    try {
      const saved = await act(action);
      const resolve = resolveAction.current;
      resolveAction.current = null;
      setPending(null);
      resolve?.(saved);
    } finally {
      processingAction.current = false;
    }
  }, [act, pending]);
  useEffect(() => {
    if (ownerRef.current === ownerKey) return;
    ownerRef.current = ownerKey;
    cancelPending();
  }, [cancelPending, ownerKey]);
  useEffect(() => () => { resolveAction.current?.(false); resolveAction.current = null; }, []);
  // First Contacts open (or new consent text): nothing is shared until setup is finished.
  const gated = !!setup.view && !!setup.context && setup.view.phase !== 'complete';
  return <SafeAreaView edges={standalone ? ['top', 'bottom'] : ['bottom']} style={{ flex: 1, backgroundColor: uiPalette(isDark).canvas }}>
    {gated ? <SetupWizard mode={mode} view={setup.view!} context={setup.context!} send={setup.send} pin={pin} /> : <>
      <ContactsExperience
        key={user?.id ?? 'guest'}
        snapshot={network.snapshot}
        loading={authLoading || network.loading}
        busy={network.busy}
        error={network.error}
        signedIn={!!user}
        standalone={standalone}
        mode={mode}
        authenticating={!!pending}
        onAction={requestAction}
        onRetry={() => { void network.reload(); }}
        onSignIn={() => router.push({ pathname: '/(shared)/auth', params: { returnTo } } as never)}
        onDashboard={() => router.push('/(shared)/dashboard/contacts' as never)}
        onStandalone={() => router.push('/contacts' as never)}
      />
      {pending && <ScrollView
        style={[StyleSheet.absoluteFillObject, { backgroundColor: uiPalette(isDark).canvas, zIndex: 10 }]}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: uiTokens.space.xl, gap: uiTokens.space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {pinProof
          ? <>
              <AuthenticatorFlow scope="critical" pinProof={pinProof} onDone={() => { void finishPending(); }} />
              <ActionButton mode={mode} label="Cancel" variant="ghost" disabled={network.busy} onPress={cancelPending} />
            </>
          : <PinFlow mode={mode} pin={pin} scope="wallet:unlock" intent="unlock" authenticatorScope="critical"
              onDone={() => { void finishPending(); }} onCancel={cancelPending} />}
      </ScrollView>}
    </>}
  </SafeAreaView>;
}
