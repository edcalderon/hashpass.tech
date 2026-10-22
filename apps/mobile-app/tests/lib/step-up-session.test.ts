import {
  STEP_UP_SKEW_MS,
  currentProof,
  forgetProofs,
  isProofUsable,
  proofVersion,
  rememberProof,
  subscribeToProofs,
} from '../../lib/step-up-session';

const proofAt = (scope: 'app:unlock' | 'wallet:sign', ms: number, token = `${scope}.token`) =>
  ({ token, scope, expiresAt: new Date(Date.now() + ms).toISOString() });

describe('step-up session', () => {
  beforeEach(() => { jest.useFakeTimers(); forgetProofs(); });
  afterEach(() => { forgetProofs(); jest.useRealTimers(); });

  it('treats a proof about to lapse as already gone', () => {
    expect(isProofUsable(proofAt('wallet:sign', 60_000))).toBe(true);
    expect(isProofUsable(proofAt('wallet:sign', STEP_UP_SKEW_MS - 1))).toBe(false);
    expect(isProofUsable(proofAt('wallet:sign', -1))).toBe(false);
    expect(isProofUsable(null)).toBe(false);
    expect(isProofUsable({ token: 't', scope: 'wallet:sign', expiresAt: 'not a date' })).toBe(false);
  });

  it('keeps a proof per scope for the person who earned it, and nobody else', () => {
    rememberProof('alice', proofAt('wallet:sign', 60_000));
    expect(currentProof('alice', 'wallet:sign')?.token).toBe('wallet:sign.token');
    expect(currentProof('alice', 'app:unlock')).toBeNull();
    expect(currentProof('bob', 'wallet:sign')).toBeNull();
    expect(currentProof(null, 'wallet:sign')).toBeNull();
  });

  it('drops every proof when a different account takes over', () => {
    rememberProof('alice', proofAt('wallet:sign', 60_000));
    rememberProof('alice', proofAt('app:unlock', 60_000));
    rememberProof('bob', proofAt('app:unlock', 60_000, 'bob.token'));
    expect(currentProof('alice', 'wallet:sign')).toBeNull();
    expect(currentProof('alice', 'app:unlock')).toBeNull();
    expect(currentProof('bob', 'wallet:sign')).toBeNull();
    expect(currentProof('bob', 'app:unlock')?.token).toBe('bob.token');
  });

  it('expires on its own and tells subscribers, so an unlocked screen locks without a tap', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToProofs(listener);
    rememberProof('alice', proofAt('wallet:sign', 60_000));
    expect(listener).toHaveBeenCalledTimes(1);
    const before = proofVersion();

    jest.advanceTimersByTime(60_000);
    expect(currentProof('alice', 'wallet:sign')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(proofVersion()).toBeGreaterThan(before);

    unsubscribe();
    rememberProof('alice', proofAt('wallet:sign', 60_000));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('replaces a scope without the old proof timer wiping the new one', () => {
    rememberProof('alice', proofAt('wallet:sign', 10_000, 'old'));
    rememberProof('alice', proofAt('wallet:sign', 120_000, 'new'));
    jest.advanceTimersByTime(30_000);
    expect(currentProof('alice', 'wallet:sign')?.token).toBe('new');
  });

  it('forgets one scope or all of them, and clears timers', () => {
    rememberProof('alice', proofAt('wallet:sign', 60_000));
    rememberProof('alice', proofAt('app:unlock', 60_000));
    forgetProofs('wallet:sign');
    expect(currentProof('alice', 'wallet:sign')).toBeNull();
    expect(currentProof('alice', 'app:unlock')).not.toBeNull();
    forgetProofs();
    expect(currentProof('alice', 'app:unlock')).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});
