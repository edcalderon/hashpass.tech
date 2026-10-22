/**
 * Step-up authentication types: a short-lived proof that the signed-in person
 * just re-confirmed themselves with a second factor (today a 4-digit PIN).
 *
 * A proof is not a session. It authorises exactly one scope, expires within
 * minutes, and is minted only by the server after a successful check. Sensitive
 * endpoints (wallet signing) demand a proof for their scope; everything else
 * keeps using the normal bearer session.
 */
export type StepUpScope = "app:unlock" | "wallet:sign";

export interface StepUpProof {
  token: string;
  scope: StepUpScope;
  /** ISO timestamp. Treat the proof as unusable slightly before this. */
  expiresAt: string;
}

export interface PinStatus {
  enabled: boolean;
  lockedUntil: string | null;
  remainingAttempts: number | null;
}

export interface PinOutcome {
  ok: boolean;
  enabled: boolean;
  remainingAttempts: number;
  lockedUntil: string | null;
}

export type StepUpResult =
  | { ok: true; proof: StepUpProof }
  | { ok: false; enabled: boolean; remainingAttempts: number; lockedUntil: string | null };

/**
 * Where proofs live between calls. The default is memory, so a proof dies with the
 * process. Hosts may persist them (the CLI does, so `verify` and `sign` can be
 * separate invocations), but must never persist the PIN itself.
 */
export interface StepUpProofStore {
  get(scope: StepUpScope): StepUpProof | null | Promise<StepUpProof | null>;
  set(proof: StepUpProof): void | Promise<void>;
  clear(scope?: StepUpScope): void | Promise<void>;
}

/**
 * Extension point for additional second factors (a time-boxed device locker, a
 * hardware key, ...). A method turns a credential it understands into a proof;
 * the proof format and the server-side scope checks stay the same, so adding a
 * method never changes what sensitive endpoints accept.
 */
export interface SecondFactorMethod<Credential = string> {
  readonly id: string;
  verify(credential: Credential, scope: StepUpScope): Promise<StepUpResult>;
}

/** API envelope shapes used by the step-up routes. */
export interface Envelope<T> { success: boolean; data?: T; error?: string }
export interface VerifyData extends PinOutcome { proof?: { token: string; expiresAt: string } }
