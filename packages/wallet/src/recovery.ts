import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { derivePublicWallet, normalizeMnemonic, secureRandom, type PublicWallet, type SecureRandom, type WalletNetwork } from './core';
import { decryptVault, encryptVault } from './vault';

// Portable backups are not bound to an account/device. This fixed AAD domain is
// deliberately different from every normal vault owner. Password protects export.
const BACKUP_SCOPE = { environment: 'development' as const, ownerId: 'portable-recovery', walletId: 'v1' };

export function publicWalletFingerprint(wallet: PublicWallet): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify([
    wallet.version, wallet.network, wallet.accountIndex,
    wallet.ethereum.path, wallet.ethereum.address, wallet.bitcoin.path, wallet.bitcoin.address,
    wallet.solana.path, wallet.solana.address,
  ]))));
}

/** HASHPASS recovery format, NOT an Ethereum V3/MetaMask JSON keystore. */
export async function exportRecoveryBackup(
  phrase: string, network: WalletNetwork, password: string, random: SecureRandom = secureRandom,
): Promise<string> {
  const payload = await encryptVault(BACKUP_SCOPE, phrase, network, password, random);
  return JSON.stringify({ format: 'hashpass-recovery', version: 1, payload });
}

export async function importRecoveryBackup(
  backup: string, password: string, expected?: PublicWallet,
): Promise<{ mnemonic: string; wallet: PublicWallet }> {
  if (typeof backup !== 'string' || backup.length > 16_384) throw new Error('invalid_backup');
  let value;
  try { value = JSON.parse(backup); } catch { throw new Error('invalid_backup'); }
  if (!value || value.format !== 'hashpass-recovery' || value.version !== 1 || typeof value.payload !== 'string') {
    throw new Error('invalid_backup');
  }
  const contents = await decryptVault(BACKUP_SCOPE, value.payload, password);
  const wallet = derivePublicWallet(contents.mnemonic, contents.network);
  if (expected && publicWalletFingerprint(expected) !== publicWalletFingerprint(wallet)) throw new Error('backup_wallet_mismatch');
  return { mnemonic: contents.mnemonic, wallet };
}

export type RecoveryChallenge = {
  /** Zero-based positions; render human labels as position + 1. */
  positions: readonly number[];
  verify(answers: readonly string[]): boolean;
  dispose(): void;
};

export function createRecoveryChallenge(phrase: string, random: SecureRandom = secureRandom): RecoveryChallenge {
  const words = normalizeMnemonic(phrase).split(' ');
  const positions: number[] = [];
  // Rejection sampling avoids modulo bias. Cap retries to fail on a broken RNG.
  for (let tries = 0; positions.length < 3 && tries < 128; tries += 1) {
    const byte = random(1);
    if (byte.length !== 1) throw new Error('secure_random_unavailable');
    if (byte[0] >= Math.floor(256 / words.length) * words.length) continue;
    const position = byte[0] % words.length;
    if (!positions.includes(position)) positions.push(position);
  }
  if (positions.length !== 3) throw new Error('secure_random_unavailable');
  const salt = random(32);
  if (salt.length !== 32) throw new Error('secure_random_unavailable');
  const digest = (word: string) => sha256(concatBytes(salt, utf8ToBytes(word)));
  const expected = positions.map(position => digest(words[position]));
  words.fill('');
  let disposed = false;
  return {
    positions: Object.freeze(positions),
    verify(answers) {
      if (disposed || !Array.isArray(answers) || answers.length !== 3 ||
          answers.some(answer => typeof answer !== 'string' || answer.length > 32)) return false;
      let difference = 0;
      answers.forEach((answer, i) => {
        const actual = digest(answer.normalize('NFKD').trim().toLowerCase());
        for (let j = 0; j < actual.length; j += 1) difference |= actual[j] ^ expected[i][j];
        actual.fill(0);
      });
      return difference === 0;
    },
    dispose() { disposed = true; salt.fill(0); expected.forEach(hash => hash.fill(0)); },
  };
}
