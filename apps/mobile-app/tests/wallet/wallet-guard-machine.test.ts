import { createActor } from 'xstate';
import { walletGuardMachine } from '../../hooks/wallet-guard-machine';

const start = () => { const a = createActor(walletGuardMachine); a.start(); return a; };

describe('wallet guard machine', () => {
  it('routes by PIN state after the check', () => {
    const none = start(); none.send({ type: 'CHECK_DONE', pinEnabled: false, unlocked: false });
    expect(none.getSnapshot().value).toBe('pin_setup');
    const has = start(); has.send({ type: 'CHECK_DONE', pinEnabled: true, unlocked: false });
    expect(has.getSnapshot().value).toBe('pin_entry');
    const live = start(); live.send({ type: 'CHECK_DONE', pinEnabled: true, unlocked: true });
    expect(live.getSnapshot().value).toBe('unlocked');
  });

  it('never unlocks without a PIN even if a stale proof is reported', () => {
    const a = start(); a.send({ type: 'CHECK_DONE', pinEnabled: false, unlocked: true });
    expect(a.getSnapshot().value).toBe('pin_setup');
  });

  it('cannot skip the PIN from checking, entry or locked', () => {
    const a = start();
    a.send({ type: 'UNLOCKED' });
    expect(a.getSnapshot().value).toBe('checking');
    a.send({ type: 'CHECK_DONE', pinEnabled: true, unlocked: false });
    a.send({ type: 'PIN_SETUP_DONE' });
    expect(a.getSnapshot().value).toBe('pin_entry');
  });

  it('locks on expiry or backgrounding and needs the PIN again', () => {
    const a = start(); a.send({ type: 'CHECK_DONE', pinEnabled: true, unlocked: true });
    a.send({ type: 'APP_BACKGROUND' });
    expect(a.getSnapshot().value).toBe('locked');
    a.send({ type: 'UNLOCKED' });
    expect(a.getSnapshot().value).toBe('unlocked');
    a.send({ type: 'LOCKED' });
    expect(a.getSnapshot().value).toBe('locked');
  });

  it('recovers from a failed check with RETRY', () => {
    const a = start(); a.send({ type: 'CHECK_FAILED' });
    expect(a.getSnapshot().value).toBe('unavailable');
    a.send({ type: 'RETRY' });
    expect(a.getSnapshot().value).toBe('checking');
  });
});
