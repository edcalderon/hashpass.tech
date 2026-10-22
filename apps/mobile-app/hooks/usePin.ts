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
  type StepUpScope,
} from '../lib/step-up-session';
import type { PinOutcome } from '../types/setup';

export { PIN_LENGTH };
export const isPinComplete = (value: string) => /^\d{4}$/.test(value);

export type PinProblem =
  | { kind: 'wrong'; remainingAttempts: number }
  | { kind: 'locked'; lockedUntil: string }
  | { kind: 'not_set' }
  | { kind: 'already_set' }
  | { kind: 'unavailable' };

export interface UsePin {
  busy: boolean;
  problem: PinProblem | null;
  /** True while a proof for this scope is still good, so the person is not asked again. */
  isUnlocked: (scope: StepUpScope) => boolean;
  /** Creates a PIN (or changes it when `currentPin` is given). The PIN is passed through, never stored. */
  setPin: (pin: string, currentPin?: string) => Promise<boolean>;
  /** Checks the PIN and keeps the resulting short-lived proof in memory. */
  unlock: (pin: string, scope: StepUpScope) => Promise<boolean>;
  /** The proof to attach to a sensitive request, or null when the person must enter the PIN. */
  proofFor: (scope: StepUpScope) => string | null;
  lock: (scope?: StepUpScope) => void;
  clearProblem: () => void;
}

export function describePinOutcome(outcome: PinOutcome): PinProblem {
  if (!outcome.enabled) return { kind: 'not_set' };
  if (outcome.lockedUntil) return { kind: 'locked', lockedUntil: outcome.lockedUntil };
  return { kind: 'wrong', remainingAttempts: outcome.remainingAttempts };
}

function describeFailure(error: unknown): PinProblem {
  if (error instanceof SetupRequestError && error.code === 'pin_already_set') return { kind: 'already_set' };
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

  const setPin = useCallback(async (pin: string, currentPin?: string) => {
    if (!isPinComplete(pin) || (currentPin !== undefined && !isPinComplete(currentPin))) return false;
    const result = await run(() => requestSetPin(pin, currentPin));
    if (!result) return false;
    if (!result.value.ok) { setProblem(describePinOutcome(result.value)); return false; }
    return true;
  }, [run]);

  const unlock = useCallback(async (pin: string, scope: StepUpScope) => {
    // A malformed PIN is rejected here so it can never count as a guess.
    if (!userId || !isPinComplete(pin)) return false;
    const result = await run(() => requestVerifyPin(pin, scope));
    if (!result) return false;
    const { proof, ...outcome } = result.value;
    if (!outcome.ok || !proof) { setProblem(describePinOutcome(outcome)); return false; }
    const stored = { token: proof.token, scope, expiresAt: proof.expiresAt };
    if (!isProofUsable(stored)) { setProblem({ kind: 'unavailable' }); return false; }
    rememberProof(userId, stored);
    return true;
  }, [run, userId]);

  const proofFor = useCallback((scope: StepUpScope) => currentProof(userId, scope)?.token ?? null, [userId]);
  const isUnlocked = useCallback((scope: StepUpScope) => currentProof(userId, scope) !== null, [userId]);
  const lock = useCallback((scope?: StepUpScope) => forgetProofs(scope), []);
  const clearProblem = useCallback(() => setProblem(null), []);

  return { busy, problem, isUnlocked, setPin, unlock, proofFor, lock, clearProblem };
}
