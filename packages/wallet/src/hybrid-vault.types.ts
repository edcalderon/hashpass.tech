/** Wire format of the PIN-wrapped vault. Literal types mirror HYBRID_VAULT_FORMAT / HYBRID_KDF_VERSION / HYBRID_PIN_ITERATIONS in hybrid-vault.ts. */
export type HybridVaultEnvelope = {
  format: 'hashpass-hybrid-vault'; version: 1; algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256+HKDF-SHA256'; iterations: 210000;
  salt: string; wrapIv: string; wrappedDek: string; iv: string; ciphertext: string;
};
