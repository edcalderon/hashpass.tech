/// <reference types="jest" />

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockGetItemAsync = jest.fn(async (_key: string) => null as string | null);
const mockSetItemAsync = jest.fn(async (_key: string, _value: string) => undefined);

jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
}), { virtual: true });

const mockRpc = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// eslint-disable-next-line import/first
import {
  ensureChatKeyPair,
  fetchParticipantPublicKey,
  encryptChatMessage,
  decryptChatMessage,
} from '../../lib/chat-encryption';
// eslint-disable-next-line import/first
import { x25519 } from '@noble/curves/ed25519';
// eslint-disable-next-line import/first
import { bytesToHex } from '@noble/ciphers/utils.js';

describe('chat-encryption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(null);
  });

  describe('encrypt/decrypt round trip', () => {
    it('lets the recipient recover the plaintext using ECDH symmetry (A encrypts with A.priv+B.pub, B decrypts with B.priv+A.pub)', () => {
      const alicePriv = x25519.utils.randomSecretKey();
      const alicePub = x25519.getPublicKey(alicePriv);
      const bobPriv = x25519.utils.randomSecretKey();
      const bobPub = x25519.getPublicKey(bobPriv);

      const payload = encryptChatMessage('Running 5 minutes late, sorry!', alicePriv, bobPub);
      expect(payload.ciphertext).toEqual(expect.any(String));
      expect(payload.nonce).toEqual(expect.any(String));

      const decrypted = decryptChatMessage(payload, bobPriv, alicePub);
      expect(decrypted).toBe('Running 5 minutes late, sorry!');
    });

    it('lets the sender decrypt their own sent message using the same shared secret', () => {
      const alicePriv = x25519.utils.randomSecretKey();
      const bobPriv = x25519.utils.randomSecretKey();
      const bobPub = x25519.getPublicKey(bobPriv);
      const alicePub = x25519.getPublicKey(alicePriv);

      const payload = encryptChatMessage('See you at the booth', alicePriv, bobPub);
      // Alice re-reading her own sent message: same conversation key,
      // derived from (alicePriv, bobPub) == (bobPriv, alicePub).
      const decrypted = decryptChatMessage(payload, alicePriv, bobPub);
      expect(decrypted).toBe('See you at the booth');
    });

    it('produces a different nonce (and generally different ciphertext) for each call, even for the same plaintext', () => {
      const alicePriv = x25519.utils.randomSecretKey();
      const bobPriv = x25519.utils.randomSecretKey();
      const bobPub = x25519.getPublicKey(bobPriv);

      const first = encryptChatMessage('hello', alicePriv, bobPub);
      const second = encryptChatMessage('hello', alicePriv, bobPub);
      expect(first.nonce).not.toBe(second.nonce);
      expect(first.ciphertext).not.toBe(second.ciphertext);
    });

    it('returns null instead of throwing when the ciphertext is corrupted (tamper/wrong-key detection via AEAD)', () => {
      const alicePriv = x25519.utils.randomSecretKey();
      const bobPriv = x25519.utils.randomSecretKey();
      const bobPub = x25519.getPublicKey(bobPriv);
      const alicePub = x25519.getPublicKey(alicePriv);

      const payload = encryptChatMessage('sensitive meeting notes', alicePriv, bobPub);
      const tampered = { ...payload, ciphertext: payload.ciphertext.slice(0, -2) + 'ff' };

      expect(decryptChatMessage(tampered, bobPriv, alicePub)).toBeNull();
    });

    it('returns null when decrypted with the wrong keypair entirely', () => {
      const alicePriv = x25519.utils.randomSecretKey();
      const bobPriv = x25519.utils.randomSecretKey();
      const bobPub = x25519.getPublicKey(bobPriv);
      const eve = x25519.utils.randomSecretKey();
      const evePub = x25519.getPublicKey(eve);

      const payload = encryptChatMessage('private', alicePriv, bobPub);
      expect(decryptChatMessage(payload, eve, evePub)).toBeNull();
    });
  });

  describe('ensureChatKeyPair', () => {
    it('generates and publishes a new keypair on first use, then persists it to SecureStore', async () => {
      mockRpc.mockResolvedValue({ data: { success: true }, error: null });

      const priv = await ensureChatKeyPair('user-123');

      expect(priv).toBeInstanceOf(Uint8Array);
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'hashpass_chat_privkey_v1_user-123',
        expect.any(String)
      );
      expect(mockRpc).toHaveBeenCalledWith('publish_user_chat_public_key', {
        p_user_id: 'user-123',
        p_public_key: expect.any(String),
      });
    });

    it('reuses an existing stored key without publishing again', async () => {
      const existingPriv = x25519.utils.randomSecretKey();
      mockGetItemAsync.mockResolvedValue(bytesToHex(existingPriv));

      const priv = await ensureChatKeyPair('user-123');

      expect(priv).toEqual(existingPriv);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockSetItemAsync).not.toHaveBeenCalled();
    });

    it('throws if publishing the new public key fails, so callers do not silently proceed keyless', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });

      await expect(ensureChatKeyPair('user-123')).rejects.toThrow(/Failed to publish chat public key/);
    });
  });

  describe('fetchParticipantPublicKey', () => {
    it('returns the decoded public key bytes when the RPC finds one', async () => {
      const theirPriv = x25519.utils.randomSecretKey();
      const theirPub = x25519.getPublicKey(theirPriv);
      mockRpc.mockResolvedValue({ data: { success: true, public_key: bytesToHex(theirPub) }, error: null });

      const result = await fetchParticipantPublicKey('other-user');
      expect(result).toEqual(theirPub);
    });

    it('returns null when the other participant has not set up chat yet', async () => {
      mockRpc.mockResolvedValue({ data: { success: false, error: 'key_not_found' }, error: null });

      const result = await fetchParticipantPublicKey('other-user');
      expect(result).toBeNull();
    });

    it('returns null (not throw) on an RPC-level error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: 'network error' } });

      const result = await fetchParticipantPublicKey('other-user');
      expect(result).toBeNull();
    });
  });
});
