/** Prerequisite policy for software wallets. Evidence must come from the vault and
 * local recovery verifier, never directly from UI flags or server metadata.
 * This does not unlock a key or authorize a transaction by itself. */
export type SoftwareWalletEvidence = {
  walletId: string;
  vaultPersisted: boolean;
  backup?: { walletId: string; phraseVerified: boolean; exportRestored: boolean };
  unlock?: { walletId: string; method: 'password' | 'passkey'; expiresAt: number };
};

export type SigningBlocker = 'wallet_missing' | 'vault_missing' | 'backup_required' | 'unlock_required';

export function getSigningBlocker(
  evidence: SoftwareWalletEvidence | null,
  now: number,
): SigningBlocker | null {
  if (!evidence?.walletId) return 'wallet_missing';
  if (evidence.vaultPersisted !== true) return 'vault_missing';
  if (evidence.backup?.walletId !== evidence.walletId ||
      evidence.backup.phraseVerified !== true || evidence.backup.exportRestored !== true) {
    return 'backup_required';
  }
  if (evidence.unlock?.walletId !== evidence.walletId ||
      !['password', 'passkey'].includes(evidence.unlock.method) ||
      !Number.isFinite(now) || !Number.isFinite(evidence.unlock.expiresAt) ||
      evidence.unlock.expiresAt <= now) {
    return 'unlock_required';
  }
  return null;
}
