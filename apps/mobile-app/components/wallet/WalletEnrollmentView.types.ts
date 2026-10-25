import type { WalletEnrollment } from '../../lib/wallet/enrollment-types';

export type WalletChain = 'ethereum' | 'bitcoin' | 'solana';
export type WalletNetwork = 'mainnet' | 'testnet';
/** Supported LATAM peso display units plus the $LKS regional index reference. */
export type PesoCurrency = 'ARS' | 'CLP' | 'COP' | 'CUP' | 'DOP' | 'MXN' | 'UYU' | 'LKS';
export type BalanceCurrency = 'USD' | PesoCurrency;
export type BalanceDisplayMode = 'USD' | 'PESO';

export const PESO_CURRENCY_OPTIONS: ReadonlyArray<{
  code: PesoCurrency;
  label: string;
  symbol: string;
}> = [
  { code: 'LKS', label: '$LKS · LatAm index', symbol: '$LKS' },
  { code: 'ARS', label: 'Argentine peso', symbol: 'ARS' },
  { code: 'CLP', label: 'Chilean peso', symbol: 'CLP' },
  { code: 'COP', label: 'Colombian peso', symbol: 'COP' },
  { code: 'CUP', label: 'Cuban peso', symbol: 'CUP' },
  { code: 'DOP', label: 'Dominican peso', symbol: 'DOP' },
  { code: 'MXN', label: 'Mexican peso', symbol: 'MXN' },
  { code: 'UYU', label: 'Uruguayan peso', symbol: 'UYU' },
];

export type WalletBalanceSnapshot = {
  totals: Record<BalanceCurrency, number | null>;
  updatedAt: string;
};

export type BalanceState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; snapshot: WalletBalanceSnapshot }
  | { status: 'unavailable' };

export type State =
  | { status: 'loading' }
  | { status: 'error'; reason: 'unavailable' | 'not_enrolled' }
  | { status: 'ready'; row: WalletEnrollment };
