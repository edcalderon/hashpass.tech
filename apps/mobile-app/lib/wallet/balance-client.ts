import type { BalanceCurrency, WalletBalanceSnapshot } from '../../components/wallet/WalletEnrollmentView.types';
import type { AssetPrice, PublicWallet, QuoteCurrency } from './balance-client.types';

const REQUEST_TIMEOUT_MS = 8_000;
const PRICE_IDS = {
  ethereum: 'ethereum',
  bitcoin: 'bitcoin',
  solana: 'solana',
} as const;

const FIAT_QUOTE_CODES: ReadonlyArray<QuoteCurrency> = [
  'usd', 'ars', 'brl', 'clp', 'cop', 'cup', 'dop', 'mxn', 'uyu',
];

// $LKS is the regional index reference used by HASHPASS. Its published basket
// is BRL 40%, MXN 30%, COP 15%, CLP 10%, and ARS 5%. We derive the reference
// unit from the same public quote set as the wallet total; no token price is
// invented when one of the basket inputs is missing.
const LKS_BASKET: ReadonlyArray<readonly [QuoteCurrency, number]> = [
  ['brl', 0.4],
  ['mxn', 0.3],
  ['cop', 0.15],
  ['clp', 0.1],
  ['ars', 0.05],
];

class BalanceUnavailableError extends Error {
  constructor() {
    super('wallet_balances_unavailable');
    this.name = 'BalanceUnavailableError';
  }
}

const endpointFor = (network: PublicWallet['network']) => network === 'testnet'
  ? {
    ethereum: 'https://rpc.sepolia.org',
    bitcoin: 'https://blockstream.info/testnet/api',
    solana: 'https://api.devnet.solana.com',
  }
  : {
    ethereum: 'https://cloudflare-eth.com',
    bitcoin: 'https://blockstream.info/api',
    solana: 'https://api.mainnet-beta.solana.com',
  };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await globalThis.fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new BalanceUnavailableError();
    return await response.json() as T;
  } catch {
    throw new BalanceUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}

async function readEthereumBalance(url: string, address: string): Promise<number> {
  const body = await requestJson<{ result?: unknown }>(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
  });
  if (typeof body.result !== 'string' || !/^0x[0-9a-f]+$/i.test(body.result)) throw new BalanceUnavailableError();
  return Number(BigInt(body.result)) / 1e18;
}

async function readBitcoinBalance(url: string, address: string): Promise<number> {
  const body = await requestJson<{
    chain_stats?: { funded_txo_sum?: unknown; spent_txo_sum?: unknown };
    mempool_stats?: { funded_txo_sum?: unknown; spent_txo_sum?: unknown };
  }>(`${url}/address/${encodeURIComponent(address)}`);
  const confirmed = body.chain_stats;
  const pending = body.mempool_stats;
  const funded = Number(confirmed?.funded_txo_sum ?? 0) + Number(pending?.funded_txo_sum ?? 0);
  const spent = Number(confirmed?.spent_txo_sum ?? 0) + Number(pending?.spent_txo_sum ?? 0);
  if (!Number.isFinite(funded) || !Number.isFinite(spent)) throw new BalanceUnavailableError();
  return Math.max(0, funded - spent) / 1e8;
}

async function readSolanaBalance(url: string, address: string): Promise<number> {
  const body = await requestJson<{ result?: { value?: unknown } }>(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
  });
  const lamports = Number(body.result?.value);
  if (!Number.isFinite(lamports)) throw new BalanceUnavailableError();
  return lamports / 1e9;
}

async function readPrices(): Promise<Record<keyof typeof PRICE_IDS, AssetPrice>> {
  const ids = Object.values(PRICE_IDS).join(',');
  const body = await requestJson<Record<string, AssetPrice>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${FIAT_QUOTE_CODES.join(',')}`,
    { headers: { Accept: 'application/json' } },
  );
  return {
    ethereum: body[PRICE_IDS.ethereum] ?? {},
    bitcoin: body[PRICE_IDS.bitcoin] ?? {},
    solana: body[PRICE_IDS.solana] ?? {},
  };
}

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Reads public chain balances and converts them with the current public market
 * quote. No private key or wallet secret is sent; when an indexer or quote
 * source is unavailable the UI receives null rather than a fabricated zero.
 */
export async function fetchWalletBalanceSnapshot(wallet: PublicWallet): Promise<WalletBalanceSnapshot> {
  const endpoints = endpointFor(wallet.network);
  const [ethereum, bitcoin, solana, prices] = await Promise.all([
    readEthereumBalance(endpoints.ethereum, wallet.ethereum.address),
    readBitcoinBalance(endpoints.bitcoin, wallet.bitcoin.address),
    readSolanaBalance(endpoints.solana, wallet.solana.address),
    readPrices(),
  ]);

  const quantities = { ethereum, bitcoin, solana };
  const totals = (['USD', 'ARS', 'CLP', 'COP', 'CUP', 'DOP', 'MXN', 'UYU', 'LKS'] as const)
    .reduce<Record<BalanceCurrency, number | null>>((result, currency) => {
    if (currency === 'LKS') return result;
    const key = currency.toLowerCase() as keyof AssetPrice;
    const converted = (Object.keys(quantities) as Array<keyof typeof quantities>).reduce((sum, asset) => {
      const price = finite(prices[asset][key]);
      return price === null ? null : sum === null ? null : sum + quantities[asset] * price;
    }, 0 as number | null);
    result[currency] = converted;
    return result;
  }, { USD: null, ARS: null, CLP: null, COP: null, CUP: null, DOP: null, MXN: null, UYU: null, LKS: null });

  const totalUsd = totals.USD;
  const referencePrice = LKS_BASKET.reduce<number | null>((sum, [currency, weight]) => {
    const usd = finite(prices.ethereum.usd);
    const local = finite(prices.ethereum[currency]);
    if (usd === null || local === null || local <= 0) return null;
    return sum === null ? null : sum + (usd / local) * weight;
  }, 0);
  totals.LKS = totalUsd === null || referencePrice === null || referencePrice <= 0
    ? null
    : totalUsd / referencePrice;

  return { totals, updatedAt: new Date().toISOString() };
}
