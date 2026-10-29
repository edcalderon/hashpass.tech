/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import RevealBadge from '../../components/RevealBadge';
import { mixHex } from '../../lib/color-mix';

jest.mock('../../hooks/useMotionAllowed', () => ({ useMotionAllowed: () => false }));
jest.mock('@hashpass/ui/primitives', () => ({ animateRevealChange: jest.fn() }));

const flat = (style: unknown): Record<string, any> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('RevealBadge', () => {
  const render = async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <RevealBadge
          testID="badge"
          label="KEYNOTE"
          color="#2563EB"
          surfaceColor="#ffffff"
          textColor="#111111"
          icon={<Text>i</Text>}
        />,
      );
    });
    return renderer!;
  };
  const pressable = (r: ReturnType<typeof create>) => r.root.findAllByProps({ testID: 'badge' })
    .find((node) => typeof node.props.onPress === 'function')!;
  const labels = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).filter((n) => n.props.children === 'KEYNOTE');

  it('starts as a small icon-only circle that is still named for screen readers', async () => {
    const renderer = await render();
    expect(labels(renderer)).toHaveLength(0);
    expect(pressable(renderer).props.accessibilityLabel).toBe('KEYNOTE');
    expect(flat(pressable(renderer).props.style).width).toBe(28);
    act(() => renderer.unmount());
  });

  it('expands to its label on hover and focus, and collapses afterwards', async () => {
    const renderer = await render();
    act(() => pressable(renderer).props.onHoverIn());
    expect(labels(renderer)).toHaveLength(1);
    expect(flat(pressable(renderer).props.style).width).toBeGreaterThan(28);
    act(() => pressable(renderer).props.onHoverOut());
    expect(labels(renderer)).toHaveLength(0);

    act(() => pressable(renderer).props.onFocus());
    expect(labels(renderer)).toHaveLength(1);
    act(() => pressable(renderer).props.onBlur());
    expect(labels(renderer)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('opens on tap for touch screens and closes itself', async () => {
    jest.useFakeTimers();
    const renderer = await render();
    act(() => pressable(renderer).props.onPress());
    expect(labels(renderer)).toHaveLength(1);
    act(() => { jest.advanceTimersByTime(2500); });
    expect(labels(renderer)).toHaveLength(0);
    act(() => renderer.unmount());
    jest.useRealTimers();
  });

  it('uses an opaque tint so the expanded pill hides the title under it', async () => {
    const renderer = await render();
    const { backgroundColor, borderColor } = flat(pressable(renderer).props.style);
    expect(backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(borderColor).toMatch(/^#[0-9a-f]{6}$/i);
    act(() => renderer.unmount());
  });
});

describe('mixHex', () => {
  it('blends over the base and passes non-hex colours through', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#2563EB', '#ffffff', 1)).toBe('#2563eb');
    expect(mixHex('rgba(0,0,0,0.5)', '#ffffff', 0.5)).toBe('rgba(0,0,0,0.5)');
  });
});
