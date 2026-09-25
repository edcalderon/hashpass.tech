import type { PublicWallet, WalletNetwork } from './core';
import type { VaultScope } from './vault';
export type WalletEnrollment = {
  scope: VaultScope; state: 'enrolled' | 'provisioning' | 'registered';
  operationId: string | null; network: WalletNetwork | null;
  wallet: PublicWallet | null; setupEnabled: boolean;
};
export interface EnrollmentTransport {
  load(): Promise<WalletEnrollment>;
  reserve(walletId: string, operationId: string): Promise<WalletEnrollment>;
  register(walletId: string, operationId: string, wallet: PublicWallet): Promise<WalletEnrollment>;
}
