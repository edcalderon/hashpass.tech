import type { SecureRandom } from './core';
import type { VaultScope } from './vault';
import type { EnrollmentTransport, WalletEnrollment } from './enrollment';
import type { HybridVaultEnvelope } from './hybrid-vault.types';

/** What the vault API hands back: identity, version, the envelope, and the server-held share. */
export type HybridVaultRecord = {
  walletId: string; version: number; serverShare: string; envelope: HybridVaultEnvelope | null;
};

/** The slice of the vault API the lifecycle needs; the app's client satisfies it. */
export interface VaultTransport {
  load(proof: string): Promise<HybridVaultRecord>;
  save(walletId: string, envelope: HybridVaultEnvelope, expectedVersion: number, proof: string): Promise<void>;
}

export type HybridWalletDeps = {
  scope: VaultScope;
  enrollment: EnrollmentTransport;
  vault: VaultTransport;
  random: SecureRandom;
  newOperationId: () => string;
  /** Short-lived proofs already minted by the PIN pad for this person. */
  proofs: { unlock(): string | null; sign(): string | null };
  /** Server-side PIN change (needs the current PIN). Resolves true when the verifier was
   *  replaced, false ONLY when the server authoritatively rejected it; throws when the
   *  outcome is unknown (the response was lost, so the server may have committed). */
  changeServerPin(next: string, current: string): Promise<boolean>;
  /** Server-side PIN reset after email-code recovery. */
  resetServerPin(next: string, recoverProof: string): Promise<void>;
};

export type CreatedWallet = { phrase: string; row: WalletEnrollment };
