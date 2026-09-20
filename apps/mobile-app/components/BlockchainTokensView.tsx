import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { supabase } from '../lib/supabase';

type BalanceState = { status: 'loading' | 'error' } | { status: 'ready'; amount: string };

// Remount for a different identity: an old account's balance must never flash
// while the next account's request is pending.
export default function BlockchainTokensView() {
  const { dbUserId } = useAuth();
  return <RewardBalance key={dbUserId ?? 'signed-out'} userId={dbUserId} />;
}

function RewardBalance({ userId }: { userId: string | null | undefined }) {
  const { colors } = useTheme();
  const { t } = useTranslation('wallet');
  const [balance, setBalance] = useState<BalanceState>({ status: 'loading' });
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const id = ++requestId.current;
    setBalance({ status: 'loading' });
    try {
      const { data, error } = await supabase.from('user_balances')
        .select('balance').eq('user_id', userId).eq('token_symbol', 'LUKAS').maybeSingle();
      if (id !== requestId.current) return;
      const amount = data ? String(data.balance) : '0';
      if (error || !/^\d+(\.\d+)?$/.test(amount)) {
        setBalance({ status: 'error' });
      } else {
        setBalance({ status: 'ready', amount });
      }
    } catch {
      if (id === requestId.current) setBalance({ status: 'error' });
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const onRefresh = () => { void refresh(); };
    if (Platform.OS === 'web') window.addEventListener('balance:refresh', onRefresh);
    return () => {
      requestId.current += 1;
      if (Platform.OS === 'web') window.removeEventListener('balance:refresh', onRefresh);
    };
  }, [refresh]);

  return (
    <View style={[styles.card, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{t('overview.rewardsLabel', 'HASHPASS REWARDS')}</Text>
      <Text style={[styles.title, { color: colors.text.primary }]}>LUKAS</Text>
      <View accessibilityLiveRegion="polite">
        {!userId ? <Text style={{ color: colors.text.secondary }}>{t('overview.rewardsSignIn', 'Sign in to see your rewards balance.')}</Text>
          : balance.status === 'loading' ? <ActivityIndicator accessibilityLabel={t('overview.loadingRewards', 'Loading rewards')} color={colors.primary} />
          : <Text style={[styles.amount, { color: colors.text.primary }]}>
            {balance.status === 'ready' ? balance.amount : t('overview.unavailable', 'Unavailable')}
          </Text>}
        {userId && balance.status === 'error' && <Text style={{ color: colors.text.secondary }}>{t('overview.rewardsError', 'Your balance could not be loaded. Please try again.')}</Text>}
      </View>
      <Text style={[styles.description, { color: colors.text.secondary }]}>{t('overview.rewardsNote', 'Your HASHPASS rewards balance is separate from your on-chain assets. No cash value or exchange rate is assumed.')}</Text>
      {userId && <Pressable accessibilityRole="button" disabled={balance.status === 'loading'}
        accessibilityState={{ disabled: balance.status === 'loading' }} onPress={() => { void refresh(); }}
        style={[styles.button, { borderColor: colors.divider }]}>
        <Text style={{ color: colors.text.primary }}>{t('overview.refreshRewards', 'Refresh rewards')}</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 24, borderWidth: 1, borderRadius: 20, gap: 12 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: '700' },
  amount: { fontSize: 32, fontWeight: '700' },
  description: { fontSize: 14, lineHeight: 22 },
  button: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 24, paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
});
