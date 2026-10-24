import type { WalletEnrollment } from './enrollment-types';
import type { BalanceCurrency } from '../../components/wallet/WalletEnrollmentView.types';

export type PublicWallet = NonNullable<WalletEnrollment['wallet']>;
export type QuoteCurrency = Lowercase<Exclude<BalanceCurrency, 'LKS'>> | 'brl';
export type AssetPrice = Partial<Record<QuoteCurrency, unknown>>;
