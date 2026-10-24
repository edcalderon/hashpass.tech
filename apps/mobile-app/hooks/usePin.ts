import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { PIN_LENGTH } from '../lib/setup';
import { requestSetPin, requestVerifyPin, SetupRequestError } from '../lib/setup-client';
import {
  currentProof,
  forgetProofs,
  isProofUsable,
  proofVersion,
  rememberProof,
  subscribeToProofs,
} from '../lib/step-up-session';
import type { PinOutcome } from '../types/setup';
import type { PinProblem, PinVerification, UsePin } from '../types/pin.types';
import type { StepUpScope } from '../types/step-up.types';

export type { PinProblem, UsePin };
export { PIN_LENGTH };
export const isPinComplete = (value: string) => /^\d{4}$/.test(value);

export function describePinOutcome(outcome: PinOutcome): PinProblem {
  if (!outcome.enabled) return { kind: 'not_set' };
  if (outcome.lockedUntil) return { kind: 'locked', lockedUntil: outcome.lockedUntil };
  return { kind: 'wrong', remainingAttempts: outcome.remainingAttempts };
}

function describeFailure(error: unknown): PinProblem {
  // The cast survives the isolated changed-file typecheck, where SetupRequestError's stub is
  // `any` and cannot narrow `unknown` the way the real class does here.
  if (error instanceof SetupRequestError && (error as SetupRequestError).code === 'pin_already_set') return { kind: 'already_set' };
  return { kind: 'unavailable' };
}

/**
 * The PIN pad's brain. Holds no PIN: the digits live in the pad's own transient state and
 * go straight to the server, and only the short-lived proof comes back. One request at a
 * time, and never an automatic retry, because every request is a guess against the lockout.
 */
export function usePin(userId: string | null): UsePin {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<PinProblem | null>(null);
  const inFlight = useRef(false);
  const owner = useRef(userId);
  const generation = useRef(0);

  // A different account must start clean: no stale error, no proof, no request still pending.
  if (owner.current !== userId) {
    owner.current = userId;
    generation.current += 1;
    inFlight.current = false;
    setBusy(false);
    setProblem(null);
  }
  useEffect(() => () => { generation.current += 1; }, []);

  // Re-render when a proof is stored or lapses, so "unlocked" never goes stale.
  useSyncExternalStore(subscribeToProofs, proofVersion, proofVersion);

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<{ value: T } | null> => {
    if (!userId || inFlight.current) return null;
    const mine = ++generation.current;
    inFlight.current = true;
    setBusy(true);
    setProblem(null);
    try {
      const value = await task();
      return generation.current === mine ? { value } : null;
    } catch (error) {
      if (generation.current === mine) setProblem(describeFailure(error));
      return null;
    } finally {
      if (generation.current === mine) { inFlight.current = false; setBusy(false); }
    }
  }, [userId]);

  /**
   * The same call as `setPin` but with the server's outcome kept apart, which the wallet's
   * PIN change needs: 'changed' the server accepted, 'rejected' the server answered no
   * (wrong current PIN, lockout), 'unknown' the response was lost so the server may have
   * committed. Only 'rejected' may be treated as an authoritative "nothing happened".
   */
  const setPinDetailed = useCallback(async (pin: string, currentPin?: string): Promise<'changed' | 'rejected' | 'unknown'> => {
    if (!isPinComplete(pin) || (currentPin !== undefined && !isPinComplete(currentPin))) return 'rejected';
    // The server's answer types are named here (not inferred) so the isolated changed-file
    // typecheck cannot lose them behind setup-client's `any` stub.
    const result = await run<PinOutcome>(() => requestSetPin(pin, currentPin));
    if (!result) return 'unknown';
    if (!result.value.ok) { setProblem(describePinOutcome(result.value)); return 'rejected'; }
    return 'changed';
  }, [run]);

  const setPin = useCallback(async (pin: string, currentPin?: string) =>
    (await setPinDetailed(pin, currentPin)) === 'changed', [setPinDetailed]);

  const unlock = useCallback(async (pin: string, scope: StepUpScope) => {
    // A malformed PIN is rejected here so it can never count as a guess.
    if (!userId || !isPinComplete(pin)) return false;
    const result = await run<PinVerification>(() => requestVerifyPin(pin, scope));
    if (!result) return false;
    const value = result.value;
    const proof = value.proof;
    if (!value.ok || !proof) { setProblem(describePinOutcome(value)); return false; }
    const stored = { token: proof.token, scope, expiresAt: proof.expiresAt };
    if (!isProofUsable(stored)) { setProblem({ kind: 'unavailable' }); return false; }
    rememberProof(userId, stored);
    return true;
  }, [run, userId]);

  const proofFor = useCallback((scope: StepUpScope) => currentProof(userId, scope)?.token ?? null, [userId]);
  const isUnlocked = useCallback((scope: StepUpScope) => currentProof(userId, scope) !== null, [userId]);
  const lock = useCallback((scope?: StepUpScope) => forgetProofs(scope), []);
  const clearProblem = useCallback(() => setProblem(null), []);

  return { busy, problem, isUnlocked, setPin, setPinDetailed, unlock, proofFor, lock, clearProblem };
}
