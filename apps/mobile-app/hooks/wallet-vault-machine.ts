import { assign, setup } from 'xstate';
import type { VaultFlowOrigin, VaultFlowStep, VaultFlowEvent, Context } from './wallet-vault-machine.types';
export type { VaultFlowOrigin, VaultFlowStep, VaultFlowEvent } from './wallet-vault-machine.types';

export const walletVaultMachine = setup({
  types: { context: {} as Context, events: {} as VaultFlowEvent, input: {} as { registered: boolean } },
  actions: {
    forgetPhraseState: assign({ acknowledged: false }),
    remember: assign(({ event }) => ({ origin: event.type === 'PIN_OK' ? event.origin : null })),
  },
  guards: { fromCreate: ({ context }) => context.origin === 'create' },
}).createMachine({
  id: 'walletVault',
  context: ({ input }) => ({ origin: null, acknowledged: false, reason: null, registered: input.registered }),
  initial: 'start',
  states: {
    start: { always: [{ guard: ({ context }) => context.registered, target: 'home' }, { target: 'intro' }] },
    // Wallets made elsewhere are deliberately not accepted: HASHPASS only manages wallets it
    // generates, and the only way out is an export (reveal).
    intro: { on: { CREATE: 'enter_pin' } },
    enter_pin: { on: { PIN_OK: { target: 'working', actions: 'remember' }, CANCEL: 'intro' } },
    working: {
      on: {
        // The vault is saved before this fires, so from here on the wallet exists even if the
        // phrase screen is skipped.
        SUCCEEDED: [
          { guard: ({ event }) => event.next === 'phrase', target: 'phrase', actions: ['forgetPhraseState', assign({ registered: true })] },
          { target: 'home', actions: assign({ registered: true }) },
        ],
        FAILED: { target: 'failed', actions: assign(({ event }) => ({ reason: event.reason })) },
      },
    },
    phrase: {
      on: {
        ACKNOWLEDGE: { actions: assign(({ context }) => ({ acknowledged: !context.acknowledged })) },
        HIDE: [{ guard: 'fromCreate', target: 'challenge' }, { target: 'home', actions: 'forgetPhraseState' }],
      },
    },
    challenge: { on: { CHALLENGE_PASSED: { target: 'home', actions: 'forgetPhraseState' }, BACK: 'phrase' } },
    home: { on: { REVEAL: 'reveal_pin', CHANGE: 'change_pin', RECOVER: 'recover_send' } },
    reveal_pin: { on: { PIN_OK: { target: 'working', actions: 'remember' }, CANCEL: 'home' } },
    change_pin: { on: { PIN_OK: { target: 'working', actions: 'remember' }, CANCEL: 'home' } },
    recover_send: {
      on: {
        CODE_SENT: 'recover_code',
        FAILED: { target: 'failed', actions: assign(({ event }) => ({ reason: event.reason })) },
      },
    },
    recover_code: { on: { CODE_OK: 'recover_phrase', CANCEL: 'home' } },
    recover_phrase: { on: { PHRASE_OK: 'recover_pin', CANCEL: 'home' } },
    recover_pin: { on: { PIN_OK: { target: 'working', actions: 'remember' }, CANCEL: 'home' } },
    failed: {
      on: { BACK: [{ guard: ({ context }) => context.registered, target: 'home' }, { target: 'intro' }] },
    },
  },
  on: { LOCK: { target: '.start', actions: 'forgetPhraseState' } },
});

export const vaultFlowStep = (value: unknown): VaultFlowStep => value as VaultFlowStep;
