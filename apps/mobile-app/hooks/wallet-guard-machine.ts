import { assign, setup } from 'xstate';
import type { WalletGuardPhase, WalletGuardEvent } from './wallet-guard-machine.types';
export type { WalletGuardPhase, WalletGuardEvent } from './wallet-guard-machine.types';

export const walletGuardMachine = setup({
  types: { context: {} as { failures: number }, events: {} as WalletGuardEvent },
}).createMachine({
  id: 'walletGuard',
  initial: 'checking',
  context: { failures: 0 },
  states: {
    checking: {
      on: {
        CHECK_DONE: [
          { guard: ({ event }) => event.pinEnabled && event.unlocked, target: 'unlocked' },
          { guard: ({ event }) => event.pinEnabled, target: 'pin_entry' },
          { target: 'pin_setup' },
        ],
        CHECK_FAILED: { target: 'unavailable', actions: assign({ failures: ({ context }) => context.failures + 1 }) },
      },
    },
    unavailable: { on: { RETRY: 'checking' } },
    pin_setup: { on: { PIN_SETUP_DONE: 'unlocked', UNLOCKED: 'unlocked' } },
    pin_entry: { on: { UNLOCKED: 'unlocked' } },
    unlocked: { on: { LOCKED: 'locked', APP_BACKGROUND: 'locked' } },
    locked: { on: { UNLOCKED: 'unlocked' } },
  },
});

export const walletGuardPhase = (value: unknown): WalletGuardPhase => value as WalletGuardPhase;
