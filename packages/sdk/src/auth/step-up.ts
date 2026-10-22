import { HashpassError } from "../errors.js";
import type { HttpTransport } from "../transport.js";

/**
 * Step-up authentication: a short-lived proof that the signed-in person just
 * re-confirmed themselves with a second factor (today a 4-digit PIN).
 *
 * A proof is not a session. It authorises exactly one scope, expires within
 * minutes, and is minted only by the server after a successful check. Sensitive
 * endpoints (wallet signing) demand a proof for their scope; everything else keeps
 * using the normal bearer session.
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

export class MemoryStepUpProofStore implements StepUpProofStore {
  readonly #proofs = new Map<StepUpScope, StepUpProof>();
  get(scope: StepUpScope): StepUpProof | null { return this.#proofs.get(scope) ?? null; }
  set(proof: StepUpProof): void { this.#proofs.set(proof.scope, proof); }
  clear(scope?: StepUpScope): void { if (scope) this.#proofs.delete(scope); else this.#proofs.clear(); }
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

/** Refuse a proof this close to expiry so it cannot lapse in flight. */
const EXPIRY_MARGIN_MS = 5_000;

export const isProofUsable = (proof: StepUpProof | null | undefined, now = Date.now()): proof is StepUpProof =>
  Boolean(proof) && Date.parse(proof!.expiresAt) - EXPIRY_MARGIN_MS > now;

export class StepUpDeniedError extends HashpassError {
  constructor(readonly outcome: Extract<StepUpResult, { ok: false }>) {
    super(
      outcome.lockedUntil ? "Too many attempts. Try again later." : "That PIN is not correct.",
      { code: "forbidden", details: outcome },
    );
    this.name = "StepUpDeniedError";
  }
}

interface Envelope<T> { success: boolean; data?: T; error?: string }
interface VerifyData extends PinOutcome { proof?: { token: string; expiresAt: string } }

export class StepUpClient {
  readonly #methods = new Map<string, SecondFactorMethod<any>>();

  constructor(
    private readonly transport: HttpTransport,
    private readonly store: StepUpProofStore,
  ) {
    this.registerMethod(new PinMethod(transport, store));
  }

  /** Add a second factor. Registering an existing id replaces it. */
  registerMethod(method: SecondFactorMethod<any>): void { this.#methods.set(method.id, method); }

  /** Whether a PIN exists and whether it is currently locked. Never reveals the PIN or its verifier. */
  async getPinStatus(): Promise<PinStatus> {
    const response = await this.transport.request<Envelope<{ pin: PinStatus }>>("setup");
    if (!response?.success || !response.data?.pin) throw unexpected();
    return response.data.pin;
  }

  /**
   * Create a PIN, or change it by passing the current one. A wrong current PIN
   * counts toward the lockout like any other guess.
   */
  async setPin(pin: string, currentPin?: string): Promise<PinOutcome> {
    assertPin(pin);
    if (currentPin !== undefined) assertPin(currentPin);
    const response = await this.transport.request<Envelope<PinOutcome>>("setup/pin", {
      method: "POST",
      body: { action: "set", pin, ...(currentPin === undefined ? {} : { currentPin }) },
    });
    if (!response?.success || !response.data) throw unexpected();
    return response.data;
  }

  /** Check a credential with the named method (default `pin`) and remember the resulting proof. */
  async verify(credential: unknown, scope: StepUpScope, methodId = "pin"): Promise<StepUpResult> {
    const method = this.#methods.get(methodId);
    if (!method) throw new HashpassError(`Unknown second factor: ${methodId}`, { code: "configuration_error" });
    return method.verify(credential, scope);
  }

  /** A stored proof for this scope that is still safely valid, or null. */
  async getProof(scope: StepUpScope): Promise<StepUpProof | null> {
    const proof = await this.store.get(scope);
    if (isProofUsable(proof)) return proof;
    if (proof) await this.store.clear(scope);
    return null;
  }

  /**
   * Reuse a valid proof, otherwise ask `prompt` for a credential and verify it.
   * Throws StepUpDeniedError when the credential is wrong or the factor is locked.
   */
  async require(scope: StepUpScope, prompt: () => Promise<unknown>, methodId = "pin"): Promise<StepUpProof> {
    const existing = await this.getProof(scope);
    if (existing) return existing;
    const result = await this.verify(await prompt(), scope, methodId);
    if (!result.ok) throw new StepUpDeniedError(result);
    return result.proof;
  }

  async clear(scope?: StepUpScope): Promise<void> { await this.store.clear(scope); }
}

class PinMethod implements SecondFactorMethod<string> {
  readonly id = "pin";
  constructor(private readonly transport: HttpTransport, private readonly store: StepUpProofStore) {}

  async verify(pin: string, scope: StepUpScope): Promise<StepUpResult> {
    assertPin(pin);
    // POST without an idempotency key is never retried by the transport. That is
    // deliberate: every verify counts as a guess, so a silent retry would burn one.
    const response = await this.transport.request<Envelope<VerifyData>>("setup/pin", {
      method: "POST",
      body: { action: "verify", pin, scope },
    });
    const data = response?.data;
    if (!response?.success || !data) throw unexpected();
    if (data.ok && data.proof) {
      const proof: StepUpProof = { token: data.proof.token, expiresAt: data.proof.expiresAt, scope };
      await this.store.set(proof);
      return { ok: true, proof };
    }
    return { ok: false, enabled: data.enabled, remainingAttempts: data.remainingAttempts, lockedUntil: data.lockedUntil };
  }
}

function assertPin(pin: unknown): asserts pin is string {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new HashpassError("A PIN is exactly four digits.", { code: "validation_error" });
  }
}

function unexpected(): HashpassError {
  return new HashpassError("Unexpected response from Hashpass", { code: "api_error" });
}
