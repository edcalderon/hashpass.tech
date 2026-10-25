import { fetchWalletBalanceSnapshot } from '../../lib/wallet/balance-client';

const wallet = {
  version: 1 as const,
  accountIndex: 0,
  network: 'testnet' as const,
  ethereum: { address: '0x0000000000000000000000000000000000000001', path: "m/44'/60'/0'/0/0" },
  bitcoin: { address: 'tb1qexample', path: "m/84'/1'/0'/0/0" },
  solana: { address: 'So11111111111111111111111111111111111111112', path: "m/44'/501'/0'/0'" },
};

const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it('reads public chain balances and converts the total into fiat currencies', async () => {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const parsed = new URL(url);
    if (parsed.hostname === 'rpc.sepolia.org') return response({ result: '0xde0b6b3a7640000' });
    if (parsed.hostname === 'blockstream.info' && parsed.pathname.startsWith('/testnet/')) {
      return response({ chain_stats: { funded_txo_sum: 10_000_000, spent_txo_sum: 0 }, mempool_stats: {} });
    }
    if (parsed.hostname === 'api.devnet.solana.com') return response({ result: { value: 2_000_000_000 } });
    return response({
      ethereum: { usd: 2_000, ars: 2_000_000, brl: 10, clp: 1_800_000, cop: 8_000_000, cup: 2_000_000, dop: 100_000, mxn: 40_000, uyu: 80_000 },
      bitcoin: { usd: 30_000, cop: 120_000_000, mxn: 600_000 },
      solana: { usd: 100, cop: 4_000, mxn: 2_000 },
    });
  }) as unknown as typeof fetch;

  const snapshot = await fetchWalletBalanceSnapshot(wallet);

  expect(snapshot.totals.USD).toBe(5_200);
  expect(snapshot.totals.COP).toBe(20_008_000);
  expect(snapshot.totals.MXN).toBe(104_000);
  expect(snapshot.totals.LKS).toBeGreaterThan(0);
  expect(snapshot.updatedAt).toEqual(expect.any(String));
});

it('fails closed when an indexer or quote source is unavailable', async () => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

  await expect(fetchWalletBalanceSnapshot(wallet)).rejects.toThrow('wallet_balances_unavailable');
});
