import { apiError } from '../server';
import type { WalletChain, WalletNetwork } from './wallet-share.types';

const ETHEREUM_ADDRESS = /^0x[0-9a-f]{40}$/i;
const BITCOIN_ADDRESS = /^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,62}|bc1[ac-hj-np-z02-9]{11,87}|[mn2][a-km-zA-HJ-NP-Z1-9]{25,62}|tb1[ac-hj-np-z02-9]{11,87})$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function decodeAddress(value: string): string | null {
  try {
    const address = decodeURIComponent(value);
    return address.length <= 128 ? address : null;
  } catch {
    return null;
  }
}

function explorerUrl(network: WalletNetwork, chain: WalletChain, address: string): string | null {
  if (chain === 'ethereum' && ETHEREUM_ADDRESS.test(address)) {
    return `https://${network === 'testnet' ? 'sepolia.' : ''}etherscan.io/address/${encodeURIComponent(address)}`;
  }
  if (chain === 'bitcoin' && BITCOIN_ADDRESS.test(address)) {
    return `https://blockstream.info${network === 'testnet' ? '/testnet' : ''}/address/${encodeURIComponent(address)}`;
  }
  if (chain === 'solana' && SOLANA_ADDRESS.test(address)) {
    return `https://explorer.solana.com/address/${encodeURIComponent(address)}${network === 'testnet' ? '?cluster=devnet' : ''}`;
  }
  return null;
}

/**
 * Public wallet-share links are deterministic, non-custodial redirects. They
 * contain only a public receiving address and never expose a key, seed phrase,
 * account identifier, or mutable QR-link record. The mobile QR still encodes
 * the raw address so wallet apps can scan it directly; this link is for social
 * previews and people who want to inspect the address in a block explorer.
 */
export async function redirectWalletShare(_request: Request, networkValue: string, chainValue: string, encodedAddress: string): Promise<Response> {
  if (networkValue !== 'mainnet' && networkValue !== 'testnet') return apiError('Invalid wallet network', 404);
  if (chainValue !== 'ethereum' && chainValue !== 'bitcoin' && chainValue !== 'solana') return apiError('Invalid wallet chain', 404);
  const address = decodeAddress(encodedAddress);
  const destination = address && explorerUrl(networkValue, chainValue, address);
  if (!destination) return apiError('Invalid wallet address', 404);
  return new Response(null, {
    status: 302,
    headers: {
      'cache-control': 'public, max-age=300',
      'referrer-policy': 'no-referrer',
      location: destination,
    },
  });
}
