import type { HybridVaultEnvelope } from '@hashpass/wallet';

/** What the server hands back after a PIN proof: the wallet identity, any envelope, and its key share. */
export type VaultEnvelope = {
  walletId: string; version: number; envelope: HybridVaultEnvelope | null; serverShare: string;
};
