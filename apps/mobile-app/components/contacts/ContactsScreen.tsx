import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { uiPalette } from '@hashpass/ui/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useContacts } from '../../hooks/useContacts';
import { useTheme } from '../../hooks/useTheme';
import ContactsExperience from './ContactsExperience';

export default function ContactsScreen({ standalone = false }) {
  const { user, isLoading: authLoading } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ card?: string }>();
  const card = typeof params.card === 'string' ? params.card : undefined;
  const network = useContacts(authLoading ? null : user?.id ?? null, card);
  const returnTo = `/contacts${card ? `?card=${encodeURIComponent(card)}` : ''}`;
  return <SafeAreaView edges={standalone ? ['top', 'bottom'] : ['bottom']} style={{ flex: 1, backgroundColor: uiPalette(isDark).canvas }}>
    <ContactsExperience
      key={user?.id ?? 'guest'}
      snapshot={network.snapshot}
      loading={authLoading || network.loading}
      busy={network.busy}
      error={network.error}
      signedIn={!!user}
      standalone={standalone}
      mode={isDark ? 'dark' : 'light'}
      onAction={network.act}
      onRetry={() => { void network.reload(); }}
      onSignIn={() => router.push({ pathname: '/(shared)/auth', params: { returnTo } } as never)}
      onDashboard={() => router.push('/(shared)/dashboard/contacts' as never)}
      onStandalone={() => router.push('/contacts' as never)}
    />
  </SafeAreaView>;
}
