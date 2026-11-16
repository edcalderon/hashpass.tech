import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createActor } from 'xstate';

import { clearAuthenticator, hasActiveAuthenticatorChallenge } from '../lib/authenticator-session';
import { fetchSetup } from '../lib/setup-client';
import { walletGuardMachine, walletGuardPhase, type WalletGuardPhase } from './wallet-guard-machine';
import { usePin, type UsePin } from './usePin';
import type { UseWalletGuard } from './useWalletGuard.types';
export type { UseWalletGuard } from './useWalletGuard.types';

export const WALLET_UNLOCK_SCOPE = 'wallet:unlock' as const;

/**
 * Runs the wallet guard for one account. The wallet content renders only in `unlocked`, and
 * the guard drops back to `locked` the moment the unlock proof lapses, the app goes to the
 * background, or the account changes — so a stale proof can never keep the view open.
 */
export function useWalletGuard(userId: string | null): UseWalletGuard {
  const pin = usePin(userId);
  const [phase, setPhase] = useState<WalletGuardPhase>('checking');
  const ownerRef = useRef(userId);
  if (ownerRef.current !== userId) { ownerRef.current = userId; clearAuthenticator(); setPhase('checking'); }
  const actorRef = useRef<ReturnType<typeof createActor<typeof walletGuardMachine>> | null>(null);

  const check = useCallback(async (actor: NonNullable<typeof actorRef.current>, cancelled: () => boolean) => {
    try {
      const setup = await fetchSetup();
      if (cancelled()) return;
      const result = { type: 'CHECK_DONE' as const, pinEnabled: setup.pin.enabled, unlocked: false };
      actor.send(result);
    } catch { if (!cancelled()) actor.send({ type: 'CHECK_FAILED' }); }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (!userId) { setPhase('checking'); return undefined; }
    let stopped = false;
    const actor = createActor(walletGuardMachine);
    actorRef.current = actor;
    const subscription = actor.subscribe(snapshot => setPhase(walletGuardPhase(snapshot.value)));
    actor.start();
    void check(actor, () => stopped);
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active' && !hasActiveAuthenticatorChallenge() && actor.getSnapshot().matches('unlocked')) {
        clearAuthenticator();
        pin.lock(WALLET_UNLOCK_SCOPE);
        actor.send({ type: 'APP_BACKGROUND' });
      }
    });
    return () => { clearAuthenticator(); pin.lock(WALLET_UNLOCK_SCOPE); stopped = true; app.remove(); subscription.unsubscribe(); actor.stop(); actorRef.current = null; };
  }, [userId, check, pin.lock]));

  // Observe proof expiry: unlocked content must not outlive the proof that opened it.
  const unlocked = phase === 'unlocked' && pin.isUnlocked(WALLET_UNLOCK_SCOPE);
  useEffect(() => {
    if (phase === 'unlocked' && !unlocked) actorRef.current?.send({ type: 'LOCKED' });
  }, [phase, unlocked]);

  // Leaving the locked state drops the in-memory wallet proofs too.
  useEffect(() => {
    if (phase === 'locked') pin.lock(WALLET_UNLOCK_SCOPE);
  }, [phase, pin.lock]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPinDone = useCallback(() => actorRef.current?.send({ type: 'UNLOCKED' }), []);
  const retry = useCallback(() => { const a = actorRef.current; if (a) { a.send({ type: 'RETRY' }); void check(a, () => false); } }, [check]);
  const lock = useCallback(() => actorRef.current?.send({ type: 'LOCKED' }), []);
  return { phase: phase === 'unlocked' && !unlocked ? 'checking' : phase, pin, onPinDone, retry, lock };
}
