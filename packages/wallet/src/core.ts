import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { NETWORK, TEST_NETWORK, p2wpkh } from '@scure/btc-signer';
import { base58 } from '@scure/base';
import { HDKey as Ed25519HDKey } from 'micro-key-producer/slip10.js';
import { computeAddress, hexlify } from 'ethers';

export type WalletNetwork = 'mainnet' | 'testnet';
export type SecureRandom = (size: number) => Uint8Array;
export type PublicAccount = Readonly<{ address: string; path: string }>;
export type PublicWallet = Readonly<{
  version: 1;
  network: WalletNetwork;
  accountIndex: number;
  ethereum: PublicAccount;
  bitcoin: PublicAccount;
  solana: PublicAccount;
}>;

/** Native callers must supply the Expo CSPRNG adapter; there is no Math.random fallback. */
export const secureRandom: SecureRandom = size => {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('secure_random_unavailable');
  return globalThis.crypto.getRandomValues(new Uint8Array(size));
};

export function normalizeMnemonic(phrase: string): string {
  if (typeof phrase !== 'string' || phrase.length > 1024) throw new Error('invalid_mnemonic');
  const normalized = phrase.normalize('NFKD').trim().split(/\s+/).join(' ');
  if (!validateMnemonic(normalized, wordlist)) throw new Error('invalid_mnemonic');
  return normalized;
}

export function generateWalletMnemonic(random: SecureRandom = secureRandom): string {
  const entropy = random(32);
  try {
    if (!(entropy instanceof Uint8Array) || entropy.length !== 32) throw new Error('secure_random_unavailable');
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy?.fill(0);
  }
}

/** Version 1 uses an empty BIP-39 passphrase. A wallet password is NOT a BIP-39
 * passphrase. Account discovery/path changes require a new manifest version. */
export function derivePublicWallet(phrase: string, network: WalletNetwork, index = 0): PublicWallet {
  if (network !== 'mainnet' && network !== 'testnet') throw new Error('invalid_network');
  if (!Number.isSafeInteger(index) || index < 0 || index >= 2 ** 31) throw new Error('invalid_account_index');
  const seed = mnemonicToSeedSync(normalizeMnemonic(phrase));
  const ethereumPath = `m/44'/60'/0'/0/${index}`;
  const bitcoinPath = `m/84'/${network === 'mainnet' ? 0 : 1}'/${index}'/0/0`;
  const solanaPath = `m/44'/501'/${index}'/0'`;
  let root: HDKey | undefined;
  let eth: HDKey | undefined;
  let btc: HDKey | undefined;
  let solRoot: Ed25519HDKey | undefined;
  let sol: Ed25519HDKey | undefined;
  try {
    root = HDKey.fromMasterSeed(seed);
    eth = root.derive(ethereumPath);
    btc = root.derive(bitcoinPath);
    solRoot = Ed25519HDKey.fromMasterSeed(seed);
    sol = solRoot.derive(solanaPath);
    if (!eth.publicKey || !btc.publicKey) throw new Error('derivation_failed');
    const bitcoinAddress = p2wpkh(btc.publicKey, network === 'mainnet' ? NETWORK : TEST_NETWORK).address;
    if (!bitcoinAddress) throw new Error('derivation_failed');
    return {
      version: 1, network, accountIndex: index,
      ethereum: { address: computeAddress(hexlify(eth.publicKey)), path: ethereumPath },
      bitcoin: { address: bitcoinAddress, path: bitcoinPath },
      solana: { address: base58.encode(sol.publicKeyRaw), path: solanaPath },
    };
  } finally {
    seed.fill(0);
    root?.wipePrivateData(); eth?.wipePrivateData(); btc?.wipePrivateData();
    solRoot?.privateKey.fill(0); solRoot?.chainCode.fill(0);
    sol?.privateKey.fill(0); sol?.chainCode.fill(0);
    // Best effort: immutable JS strings and library-internal temporaries cannot
    // be reliably erased. Callers must not cache/log phrases or derivation nodes.
  }
}
