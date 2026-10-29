/// <reference types="jest" />

import React from 'react';
import { Image, Pressable, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import AgendaRowLead from '../../components/AgendaRowLead';

const mount = async (image: unknown) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <AgendaRowLead testID="lead" label="Keynote" color="#2563EB" image={image as any} icon={<Text>icon</Text>}>
        <Text>check</Text>
      </AgendaRowLead>,
    );
  });
  return renderer;
};
const hasPhoto = (r: ReturnType<typeof create>) => r.root.findAllByType(Image).length > 0;
const hasIcon = (r: ReturnType<typeof create>) => r.root.findAllByType(Text).some((n) => n.props.children === 'icon');

describe('AgendaRowLead', () => {
  it('shows the photo first and swaps to the type icon on hover and focus', async () => {
    const r = await mount({ uri: 'https://example.com/a.jpg' });
    expect(hasPhoto(r)).toBe(true);
    expect(hasIcon(r)).toBe(false);
    const tile = r.root.findByType(Pressable);
    act(() => tile.props.onHoverIn());
    expect(hasIcon(r)).toBe(true);
    expect(hasPhoto(r)).toBe(false);
    act(() => tile.props.onHoverOut());
    expect(hasPhoto(r)).toBe(true);
    act(() => tile.props.onFocus());
    expect(hasIcon(r)).toBe(true);
    act(() => tile.props.onBlur());
    expect(hasPhoto(r)).toBe(true);
    expect(r.root.findAllByType(Text).some((n) => n.props.children === 'check')).toBe(true);
    act(() => r.unmount());
  });

  it('swaps on tap for touch screens and reverts by itself', async () => {
    jest.useFakeTimers();
    const r = await mount({ uri: 'https://example.com/a.jpg' });
    act(() => r.root.findByType(Pressable).props.onPress());
    expect(hasIcon(r)).toBe(true);
    act(() => { jest.advanceTimersByTime(2500); });
    expect(hasPhoto(r)).toBe(true);
    act(() => r.unmount());
    jest.useRealTimers();
  });

  it('shows only the icon, and is not a button, when the session has no photo', async () => {
    const r = await mount(null);
    expect(hasIcon(r)).toBe(true);
    expect(hasPhoto(r)).toBe(false);
    expect(r.root.findByType(Pressable).props.disabled).toBe(true);
    act(() => r.unmount());
  });
});
