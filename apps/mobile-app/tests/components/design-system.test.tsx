import React from 'react';
import { act, create } from 'react-test-renderer';
import { Pressable, TextInput } from 'react-native';
import { ActionButton, Badge, FilterChip, FormField, Surface } from '@hashpass/ui/primitives';
import { uiPalette } from '@hashpass/ui/tokens';
it('exposes loading and selected states while preserving accessible names', () => {
  let view: ReturnType<typeof create>;
  act(() => { view = create(<><ActionButton label="Save" loading /><FilterChip label="Upcoming" selected /><Badge>Featured</Badge></>); });
  const [button, chip] = view!.root.findAllByType(Pressable);
  expect(button.props.disabled).toBe(true); expect(button.props.accessibilityState.busy).toBe(true);
  expect(button.props.accessibilityLabel).toBe('Save'); expect(chip.props.accessibilityState.selected).toBe(true);
  act(() => view!.unmount());
});
it('keeps field errors and labels available to assistive technology', () => {
  let view: ReturnType<typeof create>;
  act(() => { view = create(<Surface mode="dark"><FormField label="Email" error="Enter a valid email" /></Surface>); });
  expect(view!.root.findByType(TextInput).props.accessibilityLabel).toBe('Email');
  expect(view!.root.findAll(node => node.props.accessibilityRole === 'alert').length).toBeGreaterThan(0);
  act(() => view!.unmount());
});
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
it.each(['light', 'dark'] as const)('maintains AA contrast for %s text and actions', mode => {
  const palette = uiPalette(mode);
  expect(contrast(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(palette.muted, palette.surface)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(palette.accent, palette.accentSoft)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(palette.onAccent, palette.accentFill)).toBeGreaterThanOrEqual(4.5);
});
