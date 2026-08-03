/**
 * End-to-end encryption for meeting chat.
 *
 * Design: each user holds a device-local X25519 keypair (private key never
 * leaves the device -- SecureStore on native, localStorage on web, mirroring
 * the pattern in lib/auth/providers/directus.ts). Only the public key is
 * published (via publish_user_chat_public_key) so the other participant can
 * derive the same shared secret. A message is encrypted with
 * XChaCha20-Poly1305 using a key derived via HKDF-SHA256 from the X25519
 * ECDH shared secret between the two participants -- the server only ever
 * sees/stores ciphertext + nonce.
 *
 * Single-device by deliberate product decision: a new device or reinstall
 * generates a fresh keypair and publishing it replaces the old public key,
 * permanently losing the ability to decrypt prior messages on that device.
 * No cross-device key backup/escrow is built. See
 * apps/docs/docs/reference/mobile-app/e2e-meeting-chat.md for the full
 * design writeup and rationale.
 */
import { Platform } from 'react-native';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes, bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';
import { supabase } from './supabase';

// @noble's RNG (used to generate keypairs and per-message nonces) requires
// globalThis.crypto.getRandomValues, which Hermes/React Native does not
// provide natively. expo-crypto is already part of the Expo SDK's linked
// native modules (unlike react-native-get-random-values, it adds no new
// native surface), so it's used here purely as the polyfill source.
function ensureCryptoPolyfill(): void {
  const g = globalThis as { crypto?: Crypto };
  if (typeof g.crypto?.getRandomValues === 'function') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExpoCrypto = require('expo-crypto') as typeof import('expo-crypto');
  g.crypto = { ...(g.crypto as object), getRandomValues: ExpoCrypto.getRandomValues } as Crypto;
}

type SecureStoreModule = typeof import('expo-secure-store');
let secureStoreModule: SecureStoreModule | null = null;
const getSecureStore = (): SecureStoreModule => {
  if (!secureStoreModule) {
    // Keep native storage lazy without using import(), which Metro rewrites
    // through Expo's async-require helper during Android release bundling.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStoreModule = require('expo-secure-store') as SecureStoreModule;
  }
  return secureStoreModule;
};

const HKDF_INFO = 'hashpass-meeting-chat-v1';
const keyStorageKey = (userId: string) => `hashpass_chat_privkey_v1_${userId}`;

async function readPrivateKeyHex(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(keyStorageKey(userId));
  }
  return getSecureStore().getItemAsync(keyStorageKey(userId));
}

async function writePrivateKeyHex(userId: string, hexKey: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(keyStorageKey(userId), hexKey);
    return;
  }
  await getSecureStore().setItemAsync(keyStorageKey(userId), hexKey);
}

/**
 * Ensures the current device has a chat keypair for this user, generating
 * and publishing one on first use. Safe to call repeatedly (returns the
 * existing key once one exists).
 */
export async function ensureChatKeyPair(userId: string): Promise<Uint8Array> {
  const existing = await readPrivateKeyHex(userId);
  if (existing) {
    return hexToBytes(existing);
  }

  ensureCryptoPolyfill();
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  await writePrivateKeyHex(userId, bytesToHex(privateKey));

  const { data, error } = await supabase.rpc('publish_user_chat_public_key', {
    p_user_id: userId,
    p_public_key: bytesToHex(publicKey),
  });
  if (error || !data?.success) {
    throw new Error(`Failed to publish chat public key: ${error?.message || data?.error || 'unknown error'}`);
  }

  return privateKey;
}

/** Returns null if the other participant hasn't set up chat yet (never opened it on any device). */
export async function fetchParticipantPublicKey(userId: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.rpc('get_user_chat_public_key', { p_user_id: userId });
  if (error || !data?.success || !data?.public_key) return null;
  return hexToBytes(data.public_key);
}

// X25519 ECDH is symmetric -- getSharedSecret(myPriv, theirPub) ===
// getSharedSecret(theirPriv, myPub) -- so a single derived key decrypts
// every message in the conversation regardless of which side sent it.
function deriveConversationKey(myPrivateKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(myPrivateKey, theirPublicKey);
  return hkdf(sha256, shared, undefined, HKDF_INFO, 32);
}

export interface EncryptedChatPayload {
  ciphertext: string;
  nonce: string;
}

export function encryptChatMessage(
  plaintext: string,
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): EncryptedChatPayload {
  ensureCryptoPolyfill();
  const key = deriveConversationKey(myPrivateKey, theirPublicKey);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(plaintext));
  return { ciphertext: bytesToHex(ciphertext), nonce: bytesToHex(nonce) };
}

/** Returns null (rather than throwing) on any decryption failure -- a
 * tampered/corrupt row should render as an inline error, not crash the
 * whole message list. */
export function decryptChatMessage(
  payload: EncryptedChatPayload,
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): string | null {
  try {
    const key = deriveConversationKey(myPrivateKey, theirPublicKey);
    const plaintextBytes = xchacha20poly1305(key, hexToBytes(payload.nonce)).decrypt(hexToBytes(payload.ciphertext));
    return bytesToUtf8(plaintextBytes);
  } catch (error) {
    console.error('[chat-encryption] Failed to decrypt message:', error);
    return null;
  }
}
