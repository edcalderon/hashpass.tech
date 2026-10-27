import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable } from 'react-native';

import PinPad, { pinKeyAction } from '../../../components/security/PinPad';

jest.mock('../../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string, params?: Record<string, unknown>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), fallback) }) }));
const mockHaptic = jest.fn();
jest.mock('../../../lib/haptics', () => ({ hapticLight: () => mockHaptic() }));

const key = (view: ReactTestRenderer, label: string) => view.root.findAllByType(Pressable).find(node => node.props.accessibilityLabel === label)!;
const tap = async (view: ReactTestRenderer, ...labels: string[]) => { for (const label of labels) await act(async () => { key(view, label).props.onPress(); }); };
const progress = (view: ReactTestRenderer) => view.root.findAll(node => String(node.props.accessibilityLabel ?? '').includes('digits entered'))[0]!.props.accessibilityLabel;

describe('PinPad', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hands over exactly four digits and then forgets them', async () => {
    const onComplete = jest.fn();
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<PinPad mode="light" title="Enter your PIN" onComplete={onComplete} />); });
    await tap(view, '1', '2', '3');
    expect(onComplete).not.toHaveBeenCalled();
    expect(progress(view)).toBe('3 of 4 digits entered');
    await tap(view, '4');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');
    expect(progress(view)).toBe('0 of 4 digits entered');
    expect(JSON.stringify(view.toJSON())).not.toContain('1234');
    expect(mockHaptic).toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('deletes the last digit, and does nothing when empty', async () => {
    const onComplete = jest.fn();
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<PinPad mode="dark" title="t" onComplete={onComplete} />); });
    await tap(view, 'Delete last digit');
    expect(progress(view)).toBe('0 of 4 digits entered');
    await tap(view, '0', 'Delete last digit');
    expect(progress(view)).toBe('0 of 4 digits entered');
    await tap(view, '9', '8', 'Delete last digit');
    expect(progress(view)).toBe('1 of 4 digits entered');
    await tap(view, '7', '6', '5');
    expect(onComplete).toHaveBeenCalledWith('9765');
    act(() => view.unmount());
  });

  it('ignores input while busy or disabled, and shows the error as an alert', async () => {
    const onComplete = jest.fn();
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<PinPad mode="light" title="t" busy onComplete={onComplete} />); });
    await tap(view, '1');
    expect(progress(view)).toBe('0 of 4 digits entered');
    expect(key(view, '1').props.accessibilityState).toEqual({ disabled: true });
    await act(async () => { view.update(<PinPad mode="light" title="t" disabled error="Too many tries" hint="hint" onComplete={onComplete} />); });
    await tap(view, '1', 'Delete last digit');
    expect(progress(view)).toBe('0 of 4 digits entered');
    expect(view.root.findAll(node => node.props.accessibilityRole === 'alert')[0]!.props.children).toBe('Too many tries');
    expect(onComplete).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('maps hardware keys the same way as the keypad', () => {
    expect(pinKeyAction('7')).toEqual({ type: 'digit', digit: '7' });
    expect(pinKeyAction('Backspace')).toEqual({ type: 'delete' });
    expect(pinKeyAction('Delete')).toEqual({ type: 'delete' });
    for (const other of ['a', 'Enter', '10', ' ', '١']) expect(pinKeyAction(other)).toBeNull();
  });
});
