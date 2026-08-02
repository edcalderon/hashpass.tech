/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#0f6',
      background: { paper: '#fff' },
      text: { primary: '#111', secondary: '#555' },
    },
  }),
}));

jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));

import OtaUpdateBanner from '../../components/OtaUpdateBanner';

describe('OtaUpdateBanner', () => {
  it('explains the ready update and applies it once from the restart action', async () => {
    const onApply = jest.fn().mockResolvedValue(undefined);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<OtaUpdateBanner onApply={onApply} />); });

    expect(renderer.root.findByProps({ children: 'Update ready' })).toBeTruthy();
    const restart = renderer.root.findByProps({ accessibilityLabel: 'Restart to apply update' });
    await act(async () => { await restart.props.onPress(); });

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(restart.props.disabled).toBe(false);
  });

  it('disables restart while applying the update', async () => {
    let finish!: () => void;
    const onApply = jest.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<OtaUpdateBanner onApply={onApply} />); });
    const restart = renderer.root.findByProps({ accessibilityLabel: 'Restart to apply update' });

    act(() => { restart.props.onPress(); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Restart to apply update' }).props.disabled).toBe(true);

    await act(async () => { finish(); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Restart to apply update' }).props.disabled).toBe(false);
  });
});
