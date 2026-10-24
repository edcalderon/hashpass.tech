import type { UsePin } from './usePin';
import type { WalletGuardPhase } from './wallet-guard-machine.types';

export interface UseWalletGuard {
  phase: WalletGuardPhase;
  pin: UsePin;
  /** Call when PinFlow finishes (create or unlock): the proof is already in memory. */
  onPinDone: () => void;
  retry: () => void;
  lock: () => void;
}
