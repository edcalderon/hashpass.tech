import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import type { LukasRewardState, LukasRewardsContextValue, LukasRewardWalletProps } from '../../types/lukas.types';
import { createInitialLukasRewardState, applyLukasReward, LUKAS_REWARD_TOTAL, playLukasClickSound } from './lukas-rewards';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import { useLukasAnimationLevel } from './useLukasMotion';
import { lukasPalette } from './lukas-ui';

const STORAGE_KEY = 'lukas.rewards.v2';
const RewardsContext = createContext<LukasRewardsContextValue | null>(null);

const isRewardState = (value: unknown): value is LukasRewardState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LukasRewardState>;
  return typeof candidate.total === 'number'
    && typeof candidate.completed === 'object'
    && typeof candidate.claimed === 'boolean';
};

export function LukasRewardsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(createInitialLukasRewardState);
  const stateRef = useRef(state);
  const [hydrated, setHydrated] = useState(false);
  const [rewardDelta, setRewardDelta] = useState(0);
  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!stored) return;
      try {
        const parsed: unknown = JSON.parse(stored);
        if (isRewardState(parsed)) {
          const restored = { ...createInitialLukasRewardState(), ...parsed };
          stateRef.current = restored;
          setState(restored);
        }
      } catch {
        // A malformed local progress record should never block the landing page.
      }
    }).catch(() => undefined).finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (hydrated) void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [hydrated, state]);

  useEffect(() => () => {
    if (deltaTimer.current) clearTimeout(deltaTimer.current);
  }, []);

  const earn = useCallback((id: Parameters<typeof applyLukasReward>[1]) => {
    const result = applyLukasReward(stateRef.current, id);
    if (!result.awarded) return result;
    stateRef.current = result.state;
    setState(result.state);
    setRewardDelta(result.awarded);
    if (deltaTimer.current) clearTimeout(deltaTimer.current);
    deltaTimer.current = setTimeout(() => setRewardDelta(0), 900);
    playLukasClickSound(result.awarded);
    return result;
  }, []);

  const markClaimed = useCallback((email: string) => {
    const nextState = { ...stateRef.current, claimed: true, claimedEmail: email.trim().toLowerCase() || null };
    stateRef.current = nextState;
    setState(nextState);
    setRewardDelta(0);
  }, []);

  const value: LukasRewardsContextValue = {
    state,
    total: state.total,
    max: LUKAS_REWARD_TOTAL,
    rewardDelta,
    hydrated,
    earn,
    markClaimed,
  };

  return <RewardsContext.Provider value={value}>{children}</RewardsContext.Provider>;
}

export function useLukasRewards(): LukasRewardsContextValue {
  const context = useContext(RewardsContext);
  if (!context) throw new Error('useLukasRewards must be used inside LukasRewardsProvider');
  return context;
}

export function LukasRewardWallet({ onOpenClaim }: LukasRewardWalletProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const palette = lukasPalette(isDark);
  const animationLevel = useLukasAnimationLevel();
  const { t } = useTranslation('lukas');
  const { total, max, rewardDelta, state } = useLukasRewards();
  const [hovered, setHovered] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (rewardDelta <= 0 || animationLevel === 'none') return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.08, friction: 4, tension: 170, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
  }, [animationLevel, rewardDelta, scale]);

  const progress = max > 0 ? Math.min(100, Math.round((total / max) * 100)) : 0;
  const claimed = state.claimed;

  return (
    <Animated.View style={[styles.wallet, { backgroundColor: palette.cardRaised, borderColor: claimed ? '#D9A72A' : palette.border, transform: [{ scale }] }, isMobile && styles.walletMobile]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={claimed ? t('rewards.claimed') : t('rewards.counterAccessibility', { total, max, progress })}
        accessibilityHint={t('rewards.counterHint')}
        disabled={claimed || total === 0}
        onPress={onOpenClaim}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={({ pressed }) => [styles.walletButton, pressed && styles.walletPressed, (claimed || total === 0) && styles.walletDisabled]}
      >
        <View style={[styles.ticketDot, { backgroundColor: claimed ? '#D9A72A' : palette.fill }]} />
        <View style={styles.walletCopy}>
          <Text style={[styles.walletLabel, { color: claimed ? '#9A6A00' : palette.accent }]}>{claimed ? t('rewards.claimed') : t('rewards.earned')}</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.walletValue, { color: palette.text }]}>{claimed ? (state.claimedEmail || 'Email reserved') : `${total}/${max} LUKAS · ${progress}%`}</Text>
        </View>
        {rewardDelta > 0 && !claimed ? <Text style={[styles.delta, { color: palette.accent }]}>+{rewardDelta}</Text> : null}
      </Pressable>
      {(hovered || claimed) ? <View style={[styles.tooltip, { backgroundColor: palette.cardRaised, borderColor: palette.border }]}><Text style={[styles.tooltipText, { color: palette.body }]}>{claimed ? `${state.claimedEmail || 'your email'} · ${t('rewards.claimTge')}` : t('rewards.claimTge')}</Text></View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wallet: { flexShrink: 1, minWidth: 144, maxWidth: 260, borderRadius: uiTokens.radius.pill, borderWidth: uiTokens.control.borderWidth, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  walletMobile: { maxWidth: '78%' },
  walletButton: { minHeight: uiTokens.control.minHeight, flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.sm, paddingHorizontal: uiTokens.space.md, paddingVertical: uiTokens.space.xs, borderRadius: uiTokens.radius.pill },
  walletPressed: { opacity: 0.82 },
  walletDisabled: { opacity: 0.76 },
  ticketDot: { width: 10, height: 10, borderRadius: uiTokens.radius.circle },
  walletCopy: { flex: 1, minWidth: 0 },
  walletLabel: { fontSize: uiTokens.type.caption - 2, fontWeight: '900', letterSpacing: 0.8 },
  walletValue: { fontSize: uiTokens.type.caption, fontWeight: '800', marginTop: 1 },
  delta: { fontSize: uiTokens.type.title, fontWeight: '900' },
  tooltip: { position: 'absolute', top: 56, left: 0, right: 0, marginTop: uiTokens.space.xs, borderRadius: uiTokens.radius.input, borderWidth: 1, padding: uiTokens.space.sm },
  tooltipText: { fontSize: uiTokens.type.caption, lineHeight: 17, fontWeight: '600' },
});
