/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Badge } from '@hashpass/ui/primitives';
import { mixHex, withAlpha } from '@hashpass/ui/tokens';

jest.mock('@hashpass/ui/primitives', () => {
  const actual = jest.requireActual('@hashpass/ui/primitives');
  return { ...actual, animateRevealChange: jest.fn() };
});

const flat = (style: unknown): Record<string, any> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('shared Badge tint and trailing icon', () => {
  it('renders a static tinted badge with its label, trailing icon and a single testID match', async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <Badge tint="#af0d01" trailingIcon={<Text>check</Text>} badgeTestID="pill">Keynote</Badge>,
      );
    });
    expect(renderer.root.findAllByProps({ children: 'Keynote' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'pill' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ children: 'check' }).length).toBeGreaterThan(0);
    expect(renderer.root.findByProps({ testID: 'pill' }).props.onPress).toBeUndefined();
    expect(flat(renderer.root.findByProps({ testID: 'pill' }).props.style).backgroundColor).toBe(withAlpha('#af0d01', 0x1a));
  });

  it('becomes pressable when onPress is provided, in dark mode', async () => {
    const onPress = jest.fn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <Badge mode="dark" tint="#22c55e" onPress={onPress} accessibilityLabel="Live now" badgeTestID="live">Live</Badge>,
      );
    });
    const pill = renderer.root.findAllByProps({ testID: 'live' }).find((node) => typeof node.props.onPress === 'function')!;
    await act(async () => {
      pill.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(pill.props.accessibilityLabel).toBe('Live now');
  });
});

describe('shared Badge revealLabel', () => {
  const render = async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <Badge revealLabel motionAllowed={false} tint="#2563EB" surfaceColor="#ffffff" leadingIcon={<Text>i</Text>} badgeTestID="badge">
          KEYNOTE
        </Badge>,
      );
    });
    return renderer;
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

describe('shared Badge interaction and tones', () => {
  const mount = async (element: React.ReactElement) => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(element);
    });
    return renderer;
  };
  const press = (r: ReturnType<typeof create>, id: string) => r.root.findAllByProps({ testID: id })
    .find((node) => typeof node.props.onPress === 'function')!;

  it('swaps an untinted pressable badge to the solid accent on hover, focus and press', async () => {
    const r = await mount(<Badge onPress={() => undefined} badgeTestID="b">Go</Badge>);
    const idle = flat(press(r, 'b').props.style).backgroundColor;
    act(() => press(r, 'b').props.onHoverIn());
    const hovered = flat(press(r, 'b').props.style).backgroundColor;
    expect(hovered).not.toBe(idle);
    act(() => press(r, 'b').props.onHoverOut());
    expect(flat(press(r, 'b').props.style).backgroundColor).toBe(idle);
    act(() => press(r, 'b').props.onFocus());
    expect(flat(press(r, 'b').props.style).backgroundColor).toBe(hovered);
    act(() => press(r, 'b').props.onBlur());
    act(() => press(r, 'b').props.onPressIn());
    expect(flat(press(r, 'b').props.style).backgroundColor).toBe(hovered);
    act(() => press(r, 'b').props.onPressOut());
    expect(flat(press(r, 'b').props.style).backgroundColor).toBe(idle);
  });

  it('keeps a tinted pressable badge on its hue and dims it while pressed', async () => {
    const r = await mount(<Badge tint="#22c55e" onPress={() => undefined} badgeTestID="t">Live</Badge>);
    const idle = flat(press(r, 't').props.style);
    act(() => press(r, 't').props.onHoverIn());
    expect(flat(press(r, 't').props.style).backgroundColor).toBe(idle.backgroundColor);
    act(() => press(r, 't').props.onPressIn());
    expect(flat(press(r, 't').props.style).opacity).toBe(0.75);
  });

  it('renders tone variants with marker, leading icon, radius and compact sizing', async () => {
    for (const tone of ['accent', 'neutral', 'onMedia'] as const) {
      const r = await mount(
        <Badge tone={tone} compact radius={6} markerColor="#ff0000" leadingIcon={<Text>i</Text>} badgeTestID="x" accessibilityLabel="x">
          Tone
        </Badge>,
      );
      expect(flat(r.root.findByProps({ testID: 'x' }).props.style).borderRadius).toBe(6);
      expect(r.root.findAllByProps({ children: 'Tone' }).length).toBeGreaterThan(0);
      act(() => r.unmount());
    }
  });

  it('tints in dark mode and over media with a white label', async () => {
    const dark = await mount(<Badge mode="dark" tint="#22c55e" badgeTestID="d">Dark</Badge>);
    expect(flat(dark.root.findByProps({ testID: 'd' }).props.style).backgroundColor).toBe(withAlpha('#22c55e', 0x2e));
    const media = await mount(<Badge tone="onMedia" tint="#22c55e" badgeTestID="m">Media</Badge>);
    const label = media.root.findAllByType(Text).find((n) => n.props.children === 'Media')!;
    expect(flat(label.props.style).color).toBe('#ffffff');
  });

  it('follows the system reduced-motion setting when no override is given', async () => {
    const info = require('react-native').AccessibilityInfo;
    const spy = jest.spyOn(info, 'isReduceMotionEnabled').mockResolvedValue(false);
    const r = await mount(
      <Badge revealLabel leadingIcon={<Text>i</Text>} badgeTestID="s">System</Badge>,
    );
    act(() => press(r, 's').props.onHoverIn());
    expect(r.root.findAllByType(Text).some((n) => n.props.children === 'System')).toBe(true);
    act(() => r.unmount());
    spy.mockRestore();
  });

  it('measures the label and sizes the expanded pill to fit it', async () => {
    const r = await mount(
      <Badge revealLabel motionAllowed={false} leadingIcon={<Text>i</Text>} badgeTestID="w">Measured</Badge>,
    );
    act(() => press(r, 'w').props.onHoverIn());
    const label = r.root.findAllByType(Text).find((n) => n.props.children === 'Measured')!;
    act(() => label.props.onLayout({ nativeEvent: { layout: { width: 60 } } }));
    expect(flat(press(r, 'w').props.style).width).toBe(28 + 60 + 12);
  });
});
