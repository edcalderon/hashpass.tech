/**
 * In-memory step-up proofs for the signed-in person. Never persisted: closing the app
 * or signing out drops every proof, so a stolen unlocked phone cannot outlive its timer
 * and a proof can never be read back by another account.
 *
 * Mirrors the SDK's `StepUpProofStore` contract (see `packages/sdk/src/auth/step-up.ts`),
 * so a device-locker or biometric method can later mint proofs into the same place.
 */
import type { StepUpProof, StepUpScope } from '../types/step-up.types';

export type { StepUpProof, StepUpScope };

/** Request header that carries a proof to an endpoint which requires one. */
export const STEP_UP_HEADER = 'X-Hashpass-Step-Up';

/** A proof about to lapse is treated as gone, so a request never races its own expiry. */
export const STEP_UP_SKEW_MS = 5_000;

export const isProofUsable = (proof: StepUpProof | null | undefined, now = Date.now()): proof is StepUpProof =>
  Boolean(proof) && Date.parse(proof!.expiresAt) - STEP_UP_SKEW_MS > now;

let owner: string | null = null;
let version = 0;
const proofs = new Map<StepUpScope, StepUpProof>();
const timers = new Map<StepUpScope, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

const notify = () => { version += 1; listeners.forEach(listener => listener()); };

function drop(scope: StepUpScope): boolean {
  const timer = timers.get(scope);
  if (timer) clearTimeout(timer);
  timers.delete(scope);
  return proofs.delete(scope);
}

/** Lets subscribers see a proof lapse without anyone having to ask for it. */
function expireAt(scope: StepUpScope, proof: StepUpProof): void {
  const wait = Math.max(0, Date.parse(proof.expiresAt) - STEP_UP_SKEW_MS - Date.now()) + 1;
  const timer = setTimeout(() => {
    if (proofs.get(scope) === proof && drop(scope)) notify();
  }, wait);
  // Never keep a test runner or a server process alive for a proof timer.
  (timer as { unref?: () => void }).unref?.();
  timers.set(scope, timer);
}

export function rememberProof(userId: string, proof: StepUpProof): void {
  if (owner !== userId) for (const scope of [...proofs.keys()]) drop(scope);
  owner = userId;
  drop(proof.scope);
  proofs.set(proof.scope, proof);
  expireAt(proof.scope, proof);
  notify();
}

/** Read-only: safe to call while rendering. Expired proofs are removed by their own timer. */
export function currentProof(userId: string | null, scope: StepUpScope, now = Date.now()): StepUpProof | null {
  if (!userId || owner !== userId) return null;
  const proof = proofs.get(scope);
  return isProofUsable(proof, now) ? proof ?? null : null;
}

export function forgetProofs(scope?: StepUpScope): void {
  if (scope) drop(scope);
  else { for (const key of [...proofs.keys()]) drop(key); owner = null; }
  notify();
}

export const proofVersion = () => version;

export function subscribeToProofs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
