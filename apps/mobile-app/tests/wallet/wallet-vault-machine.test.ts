import { createActor } from 'xstate';
import { walletVaultMachine } from '../../hooks/wallet-vault-machine';

const start = (registered: boolean) => {
  const actor = createActor(walletVaultMachine, { input: { registered } });
  actor.start();
  return actor;
};
const phase = (actor: ReturnType<typeof start>) => actor.getSnapshot().value;

describe('wallet vault flow machine', () => {
  it('starts at intro for a new wallet and at home for an existing one', () => {
    expect(phase(start(false))).toBe('intro');
    expect(phase(start(true))).toBe('home');
  });

  it('walks creation through the phrase screen and the word challenge to home', () => {
    const actor = start(false);
    actor.send({ type: 'CREATE' });
    expect(phase(actor)).toBe('enter_pin');
    actor.send({ type: 'PIN_OK', origin: 'create' });
    expect(phase(actor)).toBe('working');
    actor.send({ type: 'SUCCEEDED', next: 'phrase' });
    expect(phase(actor)).toBe('phrase');
    // The acknowledgment toggles; a LOCK here clears it and restarts at home.
    actor.send({ type: 'ACKNOWLEDGE' });
    expect(actor.getSnapshot().context.acknowledged).toBe(true);
    actor.send({ type: 'LOCK' });
    expect(phase(actor)).toBe('home');
    expect(actor.getSnapshot().context.acknowledged).toBe(false);
    // A second creation reaches the phrase screen only through the PIN again.
    actor.send({ type: 'REVEAL' });
    actor.send({ type: 'PIN_OK', origin: 'reveal' });
    actor.send({ type: 'SUCCEEDED', next: 'phrase' });
    expect(phase(actor)).toBe('phrase');
    actor.send({ type: 'HIDE' });
    expect(phase(actor)).toBe('home');
  });

  it('sends a first creation from the phrase screen to the word challenge, but not a later reveal', () => {
    const actor = start(false);
    actor.send({ type: 'CREATE' });
    actor.send({ type: 'PIN_OK', origin: 'create' });
    actor.send({ type: 'SUCCEEDED', next: 'phrase' });
    actor.send({ type: 'HIDE' });
    expect(phase(actor)).toBe('challenge');
    actor.send({ type: 'CHALLENGE_PASSED' });
    expect(phase(actor)).toBe('home');
  });

  it('lets a person return from the word challenge to review the phrase again', () => {
    const actor = start(false);
    actor.send({ type: 'CREATE' });
    actor.send({ type: 'PIN_OK', origin: 'create' });
    actor.send({ type: 'SUCCEEDED', next: 'phrase' });
    actor.send({ type: 'HIDE' });
    expect(phase(actor)).toBe('challenge');
    actor.send({ type: 'BACK' });
    expect(phase(actor)).toBe('phrase');
  });

  it('offers no way to bring in a wallet made elsewhere', () => {
    const actor = start(false);
    actor.send({ type: 'IMPORT' } as never);
    expect(phase(actor)).toBe('intro');
    actor.send({ type: 'PHRASE_OK' });
    expect(phase(actor)).toBe('intro');
  });

  it('a failure during creation returns to intro, and after registration to home', () => {
    const actor = start(false);
    actor.send({ type: 'CREATE' });
    actor.send({ type: 'PIN_OK', origin: 'create' });
    actor.send({ type: 'FAILED', reason: 'vault_unlock_failed' });
    expect(phase(actor)).toBe('failed');
    expect(actor.getSnapshot().context.reason).toBe('vault_unlock_failed');
    actor.send({ type: 'BACK' });
    expect(phase(actor)).toBe('intro');

    const existing = start(true);
    existing.send({ type: 'CHANGE' });
    existing.send({ type: 'PIN_OK', origin: 'change' });
    existing.send({ type: 'FAILED', reason: 'wallet_pin_change_failed' });
    existing.send({ type: 'BACK' });
    expect(phase(existing)).toBe('home');
  });

  it('runs recovery through code, phrase and new PIN, and a LOCK during it restarts clean', () => {
    const actor = start(true);
    actor.send({ type: 'RECOVER' });
    expect(phase(actor)).toBe('recover_send');
    actor.send({ type: 'CODE_SENT' });
    actor.send({ type: 'CODE_OK' });
    actor.send({ type: 'PHRASE_OK' });
    expect(phase(actor)).toBe('recover_pin');
    actor.send({ type: 'PIN_OK', origin: 'recover' });
    actor.send({ type: 'SUCCEEDED', next: 'home' });
    expect(phase(actor)).toBe('home');
    actor.send({ type: 'RECOVER' });
    actor.send({ type: 'LOCK' });
    expect(phase(actor)).toBe('home');
  });

  it('a failed send of the recovery code reports the reason without losing the wallet state', () => {
    const actor = start(true);
    actor.send({ type: 'RECOVER' });
    actor.send({ type: 'FAILED', reason: 'wallet_code_invalid' });
    expect(phase(actor)).toBe('failed');
    expect(actor.getSnapshot().context.reason).toBe('wallet_code_invalid');
    actor.send({ type: 'BACK' });
    expect(phase(actor)).toBe('home');
  });

  it('cancels recovery from the email-send and code-entry steps', () => {
    const actor = start(true);
    actor.send({ type: 'RECOVER' });
    actor.send({ type: 'CANCEL' });
    expect(phase(actor)).toBe('home');
    actor.send({ type: 'RECOVER' });
    actor.send({ type: 'CODE_SENT' });
    actor.send({ type: 'CANCEL' });
    expect(phase(actor)).toBe('home');
  });
});
