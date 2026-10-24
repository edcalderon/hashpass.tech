import type { WalletEnrollment } from '../../lib/wallet/enrollment-types';

export type State =
  | { status: 'loading' }
  | { status: 'error'; reason: 'unavailable' | 'not_enrolled' }
  | { status: 'ready'; row: WalletEnrollment };
