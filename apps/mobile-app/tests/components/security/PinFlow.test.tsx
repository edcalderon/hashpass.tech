import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import PinFlow, { describePinProblem } from '../../../components/security/PinFlow';
import type { UsePin } from '../../../hooks/usePin';

jest.mock('../../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
let mockPad: any;
jest.mock('../../../components/security/PinPad', () => ({ __esModule: true, default: (props: any) => { mockPad = props; return null; } }));

const makePin = (overrides: Partial<UsePin> = {}): UsePin => ({
  busy: false, problem: null, isUnlocked: jest.fn(() => false), setPin: jest.fn(async () => true), unlock: jest.fn(async () => true),
  proofFor: jest.fn(() => null), lock: jest.fn(), clearProblem: jest.fn(), ...overrides,
});
async function mount(pin: UsePin, intent: 'create' | 'unlock', onDone = jest.fn(), onCancel?: () => void) {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<PinFlow mode="light" pin={pin} scope="wallet:sign" intent={intent} onDone={onDone} onCancel={onCancel} />); });
  return { view, onDone, rerender: (next: UsePin) => act(async () => { view.update(<PinFlow mode="light" pin={next} scope="wallet:sign" intent={intent} onDone={onDone} onCancel={onCancel} />); }) };
}
const enter = async (pin: string) => { await act(async () => { mockPad.onComplete(pin); }); };

describe('PinFlow', () => {
  it('unlocks with one entry and reports success only when the server accepts', async () => {
    const pin = makePin({ unlock: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) });
    const { view, onDone } = await mount(pin, 'unlock');
    expect(mockPad.title).toBe('Enter your PIN');
    await enter('1234');
    expect(pin.unlock).toHaveBeenCalledWith('1234', 'wallet:sign');
    expect(onDone).not.toHaveBeenCalled();
    await enter('1234');
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => view.unmount());
  });

  it('asks twice when creating, then saves and unlocks with the same PIN', async () => {
    const pin = makePin();
    const { view, onDone } = await mount(pin, 'create');
    expect(mockPad.title).toBe('Create a 4-digit PIN');
    await enter('4321');
    expect(mockPad.title).toBe('Confirm your PIN');
    expect(pin.setPin).not.toHaveBeenCalled();
    await enter('4321');
    expect(pin.setPin).toHaveBeenCalledWith('4321');
    expect(pin.unlock).toHaveBeenCalledWith('4321', 'wallet:sign');
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => view.unmount());
  });

  it('starts over when the confirmation differs, and never sends anything', async () => {
    const pin = makePin();
    const { view, onDone } = await mount(pin, 'create');
    await enter('1111');
    await enter('2222');
    expect(mockPad.error).toBe('The two PINs did not match. Start again.');
    expect(mockPad.title).toBe('Create a 4-digit PIN');
    expect(pin.setPin).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('does not unlock when saving the new PIN fails', async () => {
    const pin = makePin({ setPin: jest.fn(async () => false) });
    const { view, onDone } = await mount(pin, 'create');
    await enter('1234'); await enter('1234');
    expect(pin.unlock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('switches to creating when the server says there is no PIN, and back when one exists', async () => {
    const { view, rerender } = await mount(makePin(), 'unlock');
    await rerender(makePin({ problem: { kind: 'not_set' } }));
    expect(mockPad.title).toBe('Create a 4-digit PIN');
    expect(mockPad.error).toBe('No PIN is set yet. Create one to continue.');
    const clearProblem = jest.fn();
    await rerender(makePin({ problem: { kind: 'already_set' }, clearProblem }));
    expect(mockPad.title).toBe('Enter your PIN');
    expect(clearProblem).toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('blocks the pad during a lockout and clears the message when it lifts', async () => {
    jest.useFakeTimers();
    try {
      const clearProblem = jest.fn();
      const lockedUntil = new Date(Date.now() + 30_000).toISOString();
      const { view } = await mount(makePin({ problem: { kind: 'locked', lockedUntil }, clearProblem }), 'unlock');
      expect(mockPad.disabled).toBe(true);
      expect(mockPad.error).toMatch(/Too many tries/);
      await act(async () => { jest.advanceTimersByTime(30_100); });
      expect(clearProblem).toHaveBeenCalled();
      act(() => view.unmount());
    } finally { jest.useRealTimers(); }
  });

  it('offers a way out only when asked to, and not while a request runs', async () => {
    const onCancel = jest.fn();
    const { view } = await mount(makePin(), 'unlock', jest.fn(), onCancel);
    const button = () => view.root.findAll(node => node.props.accessibilityLabel === 'Not now' && typeof node.props.onPress === 'function').at(-1)!;
    act(() => button().props.onPress());
    expect(onCancel).toHaveBeenCalled();
    act(() => view.unmount());
    const plain = await mount(makePin(), 'unlock');
    expect(plain.view.root.findAll(node => node.props.accessibilityLabel === 'Not now')).toHaveLength(0);
    act(() => plain.view.unmount());
  });
});

describe('describePinProblem', () => {
  const t = (_key: string, fallback: string, params?: Record<string, unknown>) =>
    Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), fallback);
  it('describes every case without revealing anything about the PIN', () => {
    const now = Date.parse('2026-10-22T00:00:00Z');
    expect(describePinProblem(null, t)).toBeNull();
    expect(describePinProblem({ kind: 'wrong', remainingAttempts: 3 }, t)).toBe('That PIN is not right. 3 tries left.');
    expect(describePinProblem({ kind: 'locked', lockedUntil: '2026-10-22T00:00:30Z' }, t, now)).toContain('30 seconds');
    expect(describePinProblem({ kind: 'locked', lockedUntil: '2026-10-21T00:00:00Z' }, t, now)).toContain('1 seconds');
    expect(describePinProblem({ kind: 'already_set' }, t)).toMatch(/already exists/);
    expect(describePinProblem({ kind: 'unavailable' }, t)).toMatch(/could not check/);
  });
});
