/**
 * End-to-end encryption for meeting chat.
 *
 * Design: each user holds a device-local X25519 keypair (private key stored
 * in SecureStore on native, localStorage on web). Only the public key is
 * published (via publish_user_chat_public_key) so the other participant can
 * derive the same shared secret. A message is encrypted with
 * XChaCha20-Poly1305 using a key derived via HKDF-SHA256 from the X25519
 * ECDH shared secret between the two participants -- the server only ever
 * sees/stores ciphertext + nonce.
 *
 * Key backup/restore: users can optionally back up their private key,
 * encrypted with a password they provide. The encrypted backup is stored
 * server-side in user_chat_keys.encrypted_private_key_backup. The encryption
 * uses XChaCha20-Poly1305 with a key derived from the password via HKDF-SHA256
 * (32-byte key, 16-byte salt stored alongside). The server never sees the
 * plaintext private key or the password. On a new device, users restore by
 * entering their backup password. If the user forgets their backup password,
 * the backup is unrecoverable (by design -- no password reset for E2E keys).
 *
 * Publishing a new public key (key rotation) clears the encrypted backup,
 * forcing the user to create a new one if they want backup again.
 *
 * See apps/docs/docs/reference/mobile-app/e2e-meeting-chat.md for the full
 * design writeup.
 */
import { Platform } from 'react-native';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
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

// ============================================================================
// Key backup/restore: encrypt the private key with a user-provided password
// and store it server-side so it can be restored on a new device.
// ============================================================================

const BACKUP_KDF_INFO = 'hashpass-chat-key-backup-v1';
const BACKUP_SALT_BYTES = 16;

/** Derives a 32-byte encryption key from a password + salt using HKDF-SHA256. */
function deriveBackupKey(password: string, salt: Uint8Array): Uint8Array {
  const passwordBytes = utf8ToBytes(password);
  // HKDF extract: salt the password to produce a pseudo-random key (PRK)
  // HKDF expand: stretch the PRK to 32 bytes using the info string
  return hkdf(sha256, passwordBytes, salt, BACKUP_KDF_INFO, 32);
}

/** Encrypts a private key with a user-provided password. Returns the
 * encrypted key (hex) and the salt (hex) -- both must be stored server-side. */
export function encryptPrivateKeyForBackup(
  privateKey: Uint8Array,
  password: string
): { encryptedKey: string; salt: string } {
  ensureCryptoPolyfill();
  const salt = randomBytes(BACKUP_SALT_BYTES);
  const backupKey = deriveBackupKey(password, salt);
  const nonce = randomBytes(24); // XChaCha20-Poly1305 needs a 24-byte nonce
  const ciphertext = xchacha20poly1305(backupKey, nonce).encrypt(privateKey);
  // Pack as nonce:ciphertext so we can decrypt later
  const packed = bytesToHex(nonce) + ':' + bytesToHex(ciphertext);
  return { encryptedKey: packed, salt: bytesToHex(salt) };
}

/** Decrypts a private key from a backup using the user's password. Returns
 * null on failure (wrong password, tampered data, etc.) rather than throwing. */
export function decryptPrivateKeyFromBackup(
  encryptedKeyHex: string,
  saltHex: string,
  password: string
): Uint8Array | null {
  try {
    const salt = hexToBytes(saltHex);
    const backupKey = deriveBackupKey(password, salt);
    // Unpack nonce:ciphertext
    const parts = encryptedKeyHex.split(':');
    if (parts.length !== 2) return null;
    const nonce = hexToBytes(parts[0]);
    const ciphertext = hexToBytes(parts[1]);
    return xchacha20poly1305(backupKey, nonce).decrypt(ciphertext);
  } catch (error) {
    console.error('[chat-encryption] Failed to decrypt private key backup:', error);
    return null;
  }
}

/** Backs up the user's private key to the server, encrypted with their
 * password. The server never sees the plaintext key or the password. */
export async function backupChatKeyPair(
  userId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const privateKeyHex = await readPrivateKeyHex(userId);
  if (!privateKeyHex) {
    return { success: false, error: 'no_key_pair' };
  }

  const privateKey = hexToBytes(privateKeyHex);
  const { encryptedKey, salt } = encryptPrivateKeyForBackup(privateKey, password);

  const { error } = await supabase.rpc('store_chat_key_backup', {
    p_user_id: userId,
    p_encrypted_private_key: encryptedKey,
    p_salt: salt,
  });

  if (error) {
    console.error('[chat-encryption] Failed to store key backup:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/** Checks whether the user has an encrypted key backup on the server. */
export async function hasChatKeyBackup(
  userId: string
): Promise<{ hasBackup: boolean; createdAt?: string; error?: string }> {
  const { data, error } = await supabase.rpc('get_chat_key_backup', {
    p_user_id: userId,
  });

  if (error) {
    if (error.message?.includes('no_backup') || error.details?.includes('no_backup')) {
      return { hasBackup: false };
    }
    console.error('[chat-encryption] Failed to check for key backup:', error);
    return { hasBackup: false, error: error.message };
  }

  if (!data?.success || !data?.encrypted_private_key) {
    return { hasBackup: false };
  }

  return { hasBackup: true, createdAt: data.created_at };
}

/** Restores the user's private key from a server-side encrypted backup.
 * Returns true on success, false if the password is wrong or no backup exists.
 * On success, the decrypted key is written to SecureStore/localStorage and
 * the public key is re-published (so other participants can find it). */
export async function restoreChatKeyPair(
  userId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  // Fetch the encrypted backup from the server
  const { data, error } = await supabase.rpc('get_chat_key_backup', {
    p_user_id: userId,
  });

  if (error || !data?.success) {
    return { success: false, error: error?.message || 'no_backup' };
  }

  if (!data?.encrypted_private_key || !data?.salt) {
    return { success: false, error: 'no_backup' };
  }

  // Try to decrypt with the user's password
  const privateKey = decryptPrivateKeyFromBackup(
    data.encrypted_private_key,
    data.salt,
    password
  );

  if (!privateKey) {
    return { success: false, error: 'wrong_password' };
  }

  // Write the decrypted key to device storage
  await writePrivateKeyHex(userId, bytesToHex(privateKey));

  // Re-publish the public key so other participants can find it
  const publicKey = x25519.getPublicKey(privateKey);
  const { error: publishError } = await supabase.rpc('publish_user_chat_public_key', {
    p_user_id: userId,
    p_public_key: bytesToHex(publicKey),
  });

  if (publishError) {
    console.error('[chat-encryption] Failed to re-publish public key after restore:', publishError);
    // Key is restored locally, but other participants won't see the public key
    return { success: false, error: publishError.message };
  }

  return { success: true };
}

/** Deletes the encrypted key backup from the server. Call this when the user
 * rotates their keypair or opts out of backup. */
export async function deleteChatKeyBackup(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('delete_chat_key_backup', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[chat-encryption] Failed to delete key backup:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
