import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeMnemonic, secureRandom, type SecureRandom, type WalletNetwork } from './core';

export type VaultScope = Readonly<{ environment: 'production' | 'development'; ownerId: string; walletId: string }>;
export const VAULT_ITERATIONS = 600_000;
const MAX_VAULT_BYTES = 8192;
const FORMAT = 'hashpass-vault';

type VaultEnvelope = {
  format: typeof FORMAT; version: 1; algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256'; iterations: typeof VAULT_ITERATIONS;
  salt: string; iv: string; ciphertext: string;
};
export type VaultContents = { mnemonic: string; network: WalletNetwork };

function scopeBinding(scope: VaultScope): string {
  if (!scope || typeof scope.ownerId !== 'string' || typeof scope.walletId !== 'string' ||
    !['production', 'development'].includes(scope.environment) ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(scope.ownerId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(scope.walletId)) {
    throw new Error('invalid_vault_scope');
  }
  return JSON.stringify([FORMAT, 1, scope.environment, scope.ownerId, scope.walletId]);
}

export function vaultStorageKey(scope: VaultScope): string {
  return `hashpass.wallet.v1.${bytesToHex(sha256(utf8ToBytes(scopeBinding(scope))))}`;
}

export function validateWalletPassword(password: string): void {
  // Passwords are preserved byte-for-byte (no trimming/normalizing at unlock).
  if (typeof password !== 'string' || password.trim().length < 16 || password.length > 256 ||
      /^\d+$/.test(password) || new Set(password).size < 8) throw new Error('weak_wallet_password');
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  validateWalletPassword(password);
  const bytes = utf8ToBytes(password);
  try {
    // Async audited JS implementation works on Hermes without pretending that
    // WebCrypto exists there. The KDF cost is fixed by the format version.
    return await pbkdf2Async(sha256, bytes, salt, { c: VAULT_ITERATIONS, dkLen: 32, asyncTick: 10 });
  } finally { bytes.fill(0); }
}

function readEnvelope(blob: string): VaultEnvelope {
  if (typeof blob !== 'string' || blob.length > MAX_VAULT_BYTES) throw new Error('invalid_vault');
  let e: VaultEnvelope;
  try { e = JSON.parse(blob); } catch { throw new Error('invalid_vault'); }
  if (!e || e.format !== FORMAT || e.version !== 1 || e.algorithm !== 'AES-256-GCM' ||
      e.kdf !== 'PBKDF2-SHA256' || e.iterations !== VAULT_ITERATIONS ||
      typeof e.salt !== 'string' || !/^[a-f0-9]{64}$/.test(e.salt) ||
      typeof e.iv !== 'string' || !/^[a-f0-9]{24}$/.test(e.iv) ||
      typeof e.ciphertext !== 'string' || !/^(?:[a-f0-9]{2}){17,2048}$/.test(e.ciphertext)) {
    throw new Error('invalid_vault');
  }
  return e;
}

export async function encryptVault(
  scope: VaultScope, phrase: string, network: WalletNetwork, password: string,
  random: SecureRandom = secureRandom,
): Promise<string> {
  const aad = utf8ToBytes(scopeBinding(scope));
  validateWalletPassword(password);
  const mnemonic = normalizeMnemonic(phrase);
  if (network !== 'mainnet' && network !== 'testnet') throw new Error('invalid_network');
  const salt = random(32), iv = random(12);
  if (salt.length !== 32 || iv.length !== 12) throw new Error('secure_random_unavailable');
  const key = await deriveKey(password, salt);
  const plaintext = utf8ToBytes(JSON.stringify({ mnemonic, network }));
  try {
    return JSON.stringify({
      format: FORMAT, version: 1, algorithm: 'AES-256-GCM', kdf: 'PBKDF2-SHA256',
      iterations: VAULT_ITERATIONS, salt: bytesToHex(salt), iv: bytesToHex(iv),
      ciphertext: bytesToHex(gcm(key, iv, aad).encrypt(plaintext)),
    } satisfies VaultEnvelope);
  } finally { key.fill(0); plaintext.fill(0); }
}

export async function decryptVault(scope: VaultScope, blob: string, password: string): Promise<VaultContents> {
  const aad = utf8ToBytes(scopeBinding(scope));
  const e = readEnvelope(blob);
  const key = await deriveKey(password, hexToBytes(e.salt));
  let plaintext: Uint8Array | undefined;
  try {
    plaintext = gcm(key, hexToBytes(e.iv), aad).decrypt(hexToBytes(e.ciphertext));
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    if (value.network !== 'mainnet' && value.network !== 'testnet') throw new Error();
    return { mnemonic: normalizeMnemonic(value.mnemonic), network: value.network };
  } catch {
    // No raw crypto errors, input payload, password or phrase in diagnostics.
    throw new Error('vault_unlock_failed');
  } finally { key.fill(0); plaintext?.fill(0); }
}
