import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { normalizeMnemonic, secureRandom, type SecureRandom, type WalletNetwork } from './core';
import { scopeBinding, type VaultContents, type VaultScope } from './vault';
import type { HybridVaultEnvelope } from './hybrid-vault.types';
export type { HybridVaultEnvelope } from './hybrid-vault.types';

/**
 * Hybrid self-custody / custodial vault.
 *
 *   mnemonic --AES-256-GCM(DEK)--> ciphertext
 *   DEK      --AES-256-GCM(wrapKey)--> wrappedDek
 *   wrapKey  = HKDF-SHA256( PBKDF2(PIN, salt) || serverShare )
 *
 * `serverShare` is derived server-side from a key that never enters the database and is
 * released only to a request carrying a fresh `wallet:unlock` PIN proof. So:
 *   - a database dump alone cannot be attacked, even though a PIN has only 10,000 values;
 *   - the server alone (without the PIN) cannot open the seed;
 *   - the PIN and the DEK never leave the device.
 * The PIN stretch only raises the price of the offline guess an attacker holding BOTH the
 * database and the server key could still make.
 */
export const HYBRID_VAULT_FORMAT = 'hashpass-hybrid-vault';
export const HYBRID_KDF_VERSION = 1;
export const HYBRID_PIN_ITERATIONS = 210_000;
const MAX_ENVELOPE_CHARS = 8192;
const INFO = 'hashpass-hybrid-vault/wrap/v1';

const assertPin = (pin: string) => {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) throw new Error('invalid_pin');
};
const assertShare = (share: string) => {
  if (typeof share !== 'string' || !/^[a-f0-9]{64}$/.test(share)) throw new Error('invalid_server_share');
};

export function generateDek(random: SecureRandom = secureRandom): Uint8Array {
  const dek = random(32);
  if (dek.length !== 32) throw new Error('secure_random_unavailable');
  return dek;
}

async function stretchPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const bytes = utf8ToBytes(pin);
  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      try {
        const key = await subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
        return new Uint8Array(await subtle.deriveBits(
          { name: 'PBKDF2', salt, iterations: HYBRID_PIN_ITERATIONS, hash: 'SHA-256' }, key, 256));
      } catch { /* incomplete WebCrypto shim: fall back to Noble */ }
    }
    return await pbkdf2Async(sha256, bytes, salt, { c: HYBRID_PIN_ITERATIONS, dkLen: 32, asyncTick: 10 });
  } finally { bytes.fill(0); }
}

async function wrapKey(scope: VaultScope, pin: string, serverShare: string, salt: Uint8Array): Promise<Uint8Array> {
  assertPin(pin); assertShare(serverShare);
  const stretched = await stretchPin(pin, salt);
  const ikm = concatBytes(stretched, hexToBytes(serverShare));
  try { return hkdf(sha256, ikm, salt, utf8ToBytes(`${INFO}|${scopeBinding(scope)}`), 32); }
  finally { stretched.fill(0); ikm.fill(0); }
}

/** Wraps `dek` for the PIN + server share. Used at creation and again for PIN change/recovery. */
export async function pinWrapDek(
  scope: VaultScope, dek: Uint8Array, pin: string, serverShare: string, random: SecureRandom = secureRandom,
): Promise<Pick<HybridVaultEnvelope, 'salt' | 'wrapIv' | 'wrappedDek'>> {
  if (dek.length !== 32) throw new Error('invalid_dek');
  const salt = random(32), wrapIv = random(12);
  if (salt.length !== 32 || wrapIv.length !== 12) throw new Error('secure_random_unavailable');
  const key = await wrapKey(scope, pin, serverShare, salt);
  try {
    return { salt: bytesToHex(salt), wrapIv: bytesToHex(wrapIv),
      wrappedDek: bytesToHex(gcm(key, wrapIv, utf8ToBytes(scopeBinding(scope))).encrypt(dek)) };
  } finally { key.fill(0); }
}

export async function pinUnwrapDek(
  scope: VaultScope, envelope: HybridVaultEnvelope, pin: string, serverShare: string,
): Promise<Uint8Array> {
  const e = readHybridEnvelope(envelope);
  const key = await wrapKey(scope, pin, serverShare, hexToBytes(e.salt));
  try { return gcm(key, hexToBytes(e.wrapIv), utf8ToBytes(scopeBinding(scope))).decrypt(hexToBytes(e.wrappedDek)); }
  catch { throw new Error('vault_unlock_failed'); }
  finally { key.fill(0); }
}

export function readHybridEnvelope(value: unknown): HybridVaultEnvelope {
  let e: any = value;
  if (typeof value === 'string') {
    if (value.length > MAX_ENVELOPE_CHARS) throw new Error('invalid_vault');
    try { e = JSON.parse(value); } catch { throw new Error('invalid_vault'); }
  }
  if (!e || typeof e !== 'object' || e.format !== HYBRID_VAULT_FORMAT || e.version !== HYBRID_KDF_VERSION ||
      e.algorithm !== 'AES-256-GCM' || e.kdf !== 'PBKDF2-SHA256+HKDF-SHA256' || e.iterations !== HYBRID_PIN_ITERATIONS ||
      typeof e.salt !== 'string' || !/^[a-f0-9]{64}$/.test(e.salt) ||
      typeof e.wrapIv !== 'string' || !/^[a-f0-9]{24}$/.test(e.wrapIv) ||
      typeof e.wrappedDek !== 'string' || !/^[a-f0-9]{96}$/.test(e.wrappedDek) ||
      typeof e.iv !== 'string' || !/^[a-f0-9]{24}$/.test(e.iv) ||
      typeof e.ciphertext !== 'string' || !/^(?:[a-f0-9]{2}){17,2048}$/.test(e.ciphertext)) {
    throw new Error('invalid_vault');
  }
  return e as HybridVaultEnvelope;
}

export function encryptSeedWithDek(
  scope: VaultScope, dek: Uint8Array, phrase: string, network: WalletNetwork, random: SecureRandom = secureRandom,
): Pick<HybridVaultEnvelope, 'iv' | 'ciphertext'> {
  if (dek.length !== 32) throw new Error('invalid_dek');
  if (network !== 'mainnet' && network !== 'testnet') throw new Error('invalid_network');
  const mnemonic = normalizeMnemonic(phrase);
  const iv = random(12);
  if (iv.length !== 12) throw new Error('secure_random_unavailable');
  const plaintext = utf8ToBytes(JSON.stringify({ mnemonic, network }));
  try {
    return { iv: bytesToHex(iv), ciphertext: bytesToHex(gcm(dek, iv, utf8ToBytes(scopeBinding(scope))).encrypt(plaintext)) };
  } finally { plaintext.fill(0); }
}

export function decryptSeedWithDek(scope: VaultScope, dek: Uint8Array, envelope: HybridVaultEnvelope): VaultContents {
  const e = readHybridEnvelope(envelope);
  let plaintext: Uint8Array | undefined;
  try {
    plaintext = gcm(dek, hexToBytes(e.iv), utf8ToBytes(scopeBinding(scope))).decrypt(hexToBytes(e.ciphertext));
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    if (value.network !== 'mainnet' && value.network !== 'testnet') throw new Error();
    return { mnemonic: normalizeMnemonic(value.mnemonic), network: value.network };
  } catch { throw new Error('vault_unlock_failed'); }
  finally { plaintext?.fill(0); }
}

/** Convenience: build a complete envelope from a fresh DEK. The DEK is zeroed before returning. */
export async function createHybridVault(
  scope: VaultScope, phrase: string, network: WalletNetwork, pin: string, serverShare: string,
  random: SecureRandom = secureRandom,
): Promise<HybridVaultEnvelope> {
  const dek = generateDek(random);
  try {
    const seed = encryptSeedWithDek(scope, dek, phrase, network, random);
    const wrap = await pinWrapDek(scope, dek, pin, serverShare, random);
    return { format: HYBRID_VAULT_FORMAT, version: HYBRID_KDF_VERSION, algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256+HKDF-SHA256', iterations: HYBRID_PIN_ITERATIONS, ...wrap, ...seed };
  } finally { dek.fill(0); }
}

export async function openHybridVault(
  scope: VaultScope, envelope: unknown, pin: string, serverShare: string,
): Promise<VaultContents> {
  const e = readHybridEnvelope(envelope);
  const dek = await pinUnwrapDek(scope, e, pin, serverShare);
  try { return decryptSeedWithDek(scope, dek, e); } finally { dek.fill(0); }
}

/** PIN change / recovery: re-wraps the same DEK for a new PIN without touching the seed ciphertext. */
export async function rewrapHybridVault(
  scope: VaultScope, envelope: unknown, oldPin: string, newPin: string, serverShare: string,
  random: SecureRandom = secureRandom,
): Promise<HybridVaultEnvelope> {
  const e = readHybridEnvelope(envelope);
  const dek = await pinUnwrapDek(scope, e, oldPin, serverShare);
  try { return { ...e, ...(await pinWrapDek(scope, dek, newPin, serverShare, random)) }; } finally { dek.fill(0); }
}
