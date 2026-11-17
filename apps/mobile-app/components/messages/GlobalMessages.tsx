import React from 'react';
import { View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { useContactMessaging } from '../../contexts/ContactMessagingContext';
import FloatingMessages from './FloatingMessages';
export default function GlobalMessages() {
  const messages = useContactMessaging();
  const { isDark } = useTheme();
  const { t } = useTranslation('contacts');
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const router = useRouter();
  if (!messages?.account || !messages.snapshot || path.endsWith('/contacts') || /\/(auth|mcp|security)(\/|$)/.test(path)) return null;
  return <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + uiTokens.space.hero + uiTokens.space.lg, right: uiTokens.space.lg, left: uiTokens.space.lg, alignItems: 'flex-end' }}>
    <FloatingMessages mode={isDark ? 'dark' : 'light'} conversations={messages.snapshot.conversations} label={t('messages.title', 'Messages')}
      onPress={() => router.push({ pathname: '/(shared)/dashboard/wallet', params: { section: 'contacts', tab: 'messages' } } as never)} />
  </View>;
}
