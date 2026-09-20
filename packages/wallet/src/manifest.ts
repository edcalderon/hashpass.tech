import { base58, bech32 } from '@scure/base';
import { getAddress } from 'ethers';
import type { PublicWallet } from './core';

function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw new Error('invalid_public_wallet');
  return value as Record<string, unknown>;
}

/** Strict allow-list. Never spread arbitrary request data into persistence. */
export function parsePublicWallet(value: unknown): PublicWallet {
  try {
    const w = exactObject(value, ['version', 'network', 'accountIndex', 'ethereum', 'bitcoin', 'solana']);
    if (w.version !== 1 || w.accountIndex !== 0 || !['mainnet', 'testnet'].includes(w.network as string)) throw new Error();
    const network = w.network as 'mainnet' | 'testnet';
    const paths = { ethereum: "m/44'/60'/0'/0/0", bitcoin: `m/84'/${network === 'mainnet' ? 0 : 1}'/0'/0/0`, solana: "m/44'/501'/0'/0'" };
    const account = (chain: keyof typeof paths) => {
      const a = exactObject(w[chain], ['address', 'path']);
      if (a.path !== paths[chain] || typeof a.address !== 'string' || a.address.length > 100) throw new Error();
      return { address: a.address, path: paths[chain] };
    };
    const ethereum = account('ethereum'), bitcoin = account('bitcoin'), solana = account('solana');
    ethereum.address = getAddress(ethereum.address);
    const btc = bech32.decode(bitcoin.address as `${string}1${string}`);
    if (bitcoin.address !== bitcoin.address.toLowerCase() || btc.prefix !== (network === 'mainnet' ? 'bc' : 'tb') ||
        btc.words[0] !== 0 || bech32.fromWords(btc.words.slice(1)).length !== 20) throw new Error();
    if (base58.decode(solana.address).length !== 32) throw new Error();
    return { version: 1, accountIndex: 0, network, ethereum, bitcoin, solana };
  } catch { throw new Error('invalid_public_wallet'); }
}
