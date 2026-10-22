import type { StepUpScope } from './step-up.types';
import type { PinOutcome } from './setup';

/** What went wrong with a PIN entry, in words the UI can map without touching the PIN. */
export type PinProblem =
  | { kind: 'wrong'; remainingAttempts: number }
  | { kind: 'locked'; lockedUntil: string }
  | { kind: 'not_set' }
  | { kind: 'already_set' }
  | { kind: 'unavailable' };

/** The PIN pad's brain as the UI sees it: it holds proofs and problems, never a PIN. */
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

/** The server's answer to a PIN check: the attempt outcome, plus a proof when it succeeded. */
export interface PinVerification extends PinOutcome {
  proof?: { token: string; expiresAt: string };
}
