import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { describePinOutcome, usePin } from '../../hooks/usePin';
import { forgetProofs } from '../../lib/step-up-session';

const mockPost = jest.fn();
jest.mock('../../lib/api-client', () => ({ apiClient: { get: jest.fn(), post: (...args: unknown[]) => mockPost(...args) } }));

const answer = (data: unknown) => ({ success: true, data: { success: true, data } });
const ok = (proof?: { token: string; expiresAt: string }) =>
  answer({ ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null, ...(proof ? { proof } : {}) });
const wrong = (remainingAttempts: number, lockedUntil: string | null = null) =>
  answer({ ok: false, enabled: true, remainingAttempts, lockedUntil });
const proof = (ms = 60_000, token = 'proof.signature') => ({ token, expiresAt: new Date(Date.now() + ms).toISOString() });

let pin: ReturnType<typeof usePin>;
function Probe({ id }: { id: string | null }) { pin = usePin(id); return null; }

async function mount(id: string | null = 'alice') {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<Probe id={id} />); });
  return view;
}

describe('usePin', () => {
  beforeEach(() => { jest.clearAllMocks(); forgetProofs(); });
  afterEach(() => forgetProofs());

  it('keeps only the proof after a correct PIN, and exposes it for the scope it was minted for', async () => {
    mockPost.mockResolvedValue(ok(proof(60_000, 'wallet.proof')));
    const view = await mount();
    expect(pin.isUnlocked('wallet:sign')).toBe(false);
    expect(pin.proofFor('wallet:sign')).toBeNull();

    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(true); });
    expect(pin.isUnlocked('wallet:sign')).toBe(true);
    expect(pin.proofFor('wallet:sign')).toBe('wallet.proof');
    expect(pin.isUnlocked('app:unlock')).toBe(false);
    expect(JSON.stringify(pin)).not.toContain('1234');

    act(() => pin.lock('wallet:sign'));
    expect(pin.isUnlocked('wallet:sign')).toBe(false);
    act(() => view.unmount());
  });

  it('reports the attempts left for a wrong PIN and stores nothing', async () => {
    mockPost.mockResolvedValue(wrong(3));
    const view = await mount();
    await act(async () => { expect(await pin.unlock('0000', 'app:unlock')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'wrong', remainingAttempts: 3 });
    expect(pin.isUnlocked('app:unlock')).toBe(false);
    expect(pin.busy).toBe(false);
    act(() => pin.clearProblem());
    expect(pin.problem).toBeNull();
    act(() => view.unmount());
  });

  it('reports a lockout, and a missing PIN, as their own cases', async () => {
    const until = new Date(Date.now() + 30_000).toISOString();
    mockPost.mockResolvedValueOnce(wrong(0, until)).mockResolvedValueOnce(answer({ ok: false, enabled: false, remainingAttempts: 0, lockedUntil: null }));
    const view = await mount();
    await act(async () => { await pin.unlock('0000', 'app:unlock'); });
    expect(pin.problem).toEqual({ kind: 'locked', lockedUntil: until });
    await act(async () => { await pin.unlock('0000', 'app:unlock'); });
    expect(pin.problem).toEqual({ kind: 'not_set' });
    act(() => view.unmount());
  });

  it('never sends a malformed PIN, so it cannot count as a guess', async () => {
    const view = await mount();
    for (const bad of ['', '123', '12345', '12ab', ' 123', '１２３４']) {
      await act(async () => { expect(await pin.unlock(bad, 'wallet:sign')).toBe(false); });
      await act(async () => { expect(await pin.setPin(bad)).toBe(false); });
    }
    await act(async () => { expect(await pin.setPin('1234', '12')).toBe(false); });
    expect(mockPost).not.toHaveBeenCalled();
    expect(pin.problem).toBeNull();
    act(() => view.unmount());
  });

  it('does nothing for a guest', async () => {
    const view = await mount(null);
    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(false); });
    await act(async () => { expect(await pin.setPin('1234')).toBe(false); });
    expect(mockPost).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('allows one request at a time, so a double tap is one guess, not two', async () => {
    let release!: (value: unknown) => void;
    mockPost.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const view = await mount();
    let first!: Promise<boolean>;
    await act(async () => { first = pin.unlock('1234', 'wallet:sign'); });
    expect(pin.busy).toBe(true);
    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(false); });
    expect(mockPost).toHaveBeenCalledTimes(1);
    await act(async () => { release(ok(proof())); await first; });
    expect(pin.busy).toBe(false);
    expect(pin.isUnlocked('wallet:sign')).toBe(true);
    act(() => view.unmount());
  });

  it('creates and changes a PIN, and surfaces a conflict and transport failure distinctly', async () => {
    mockPost
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(wrong(4))
      .mockResolvedValueOnce({ success: true, data: { success: false, error: 'pin_already_set' } })
      .mockResolvedValueOnce({ success: false, error: 'unavailable', status: 503, data: null })
      .mockRejectedValueOnce(new Error('offline'));
    const view = await mount();

    await act(async () => { expect(await pin.setPin('4321')).toBe(true); });
    expect(mockPost).toHaveBeenLastCalledWith('setup/pin', { action: 'set', pin: '4321' }, { skipEventSegment: true, retries: 0 });
    await act(async () => { expect(await pin.setPin('2222', '1111')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'wrong', remainingAttempts: 4 });
    await act(async () => { expect(await pin.setPin('2222')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'already_set' });
    await act(async () => { expect(await pin.setPin('2222')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'unavailable' });
    await act(async () => { expect(await pin.setPin('2222')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'unavailable' });
    expect(pin.busy).toBe(false);
    act(() => view.unmount());
  });

  it('refuses a proof that is already expired instead of showing an unlocked state', async () => {
    mockPost.mockResolvedValue(ok(proof(1_000)));
    const view = await mount();
    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'unavailable' });
    expect(pin.isUnlocked('wallet:sign')).toBe(false);
    act(() => view.unmount());
  });

  it('refuses a correct answer that arrives without a proof', async () => {
    mockPost.mockResolvedValue(ok());
    const view = await mount();
    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(false); });
    expect(pin.isUnlocked('wallet:sign')).toBe(false);
    act(() => view.unmount());
  });

  it('drops a late answer meant for the previous account and shows the next one nothing', async () => {
    let release!: (value: unknown) => void;
    mockPost.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const view = await mount('alice');
    await act(async () => { void pin.unlock('1234', 'wallet:sign'); });
    await act(async () => { view.update(<Probe id="bob" />); });
    expect(pin.busy).toBe(false);
    await act(async () => { release(ok(proof(60_000, 'alice.proof'))); });
    expect(pin.isUnlocked('wallet:sign')).toBe(false);
    expect(pin.proofFor('wallet:sign')).toBeNull();
    act(() => view.unmount());
  });

  it('can retry after a failed request', async () => {
    mockPost.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok(proof()));
    const view = await mount();
    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(false); });
    expect(pin.problem).toEqual({ kind: 'unavailable' });
    await act(async () => { expect(await pin.unlock('1234', 'wallet:sign')).toBe(true); });
    expect(pin.problem).toBeNull();
    act(() => view.unmount());
  });
});

describe('describePinOutcome', () => {
  it('prefers "not set", then "locked", then "wrong"', () => {
    expect(describePinOutcome({ ok: false, enabled: false, remainingAttempts: 0, lockedUntil: null })).toEqual({ kind: 'not_set' });
    expect(describePinOutcome({ ok: false, enabled: true, remainingAttempts: 0, lockedUntil: 't' })).toEqual({ kind: 'locked', lockedUntil: 't' });
    expect(describePinOutcome({ ok: false, enabled: true, remainingAttempts: 2, lockedUntil: null })).toEqual({ kind: 'wrong', remainingAttempts: 2 });
  });
});
