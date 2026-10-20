/// <reference types="jest" />
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Image, Text } from 'react-native';
import ProfileAvatar, { getAvatarInitials } from '../../components/ProfileAvatar';

const render = (props: Partial<React.ComponentProps<typeof ProfileAvatar>>) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => { r = TestRenderer.create(<ProfileAvatar isDark={false} {...props} />); });
  return r;
};

describe('ProfileAvatar', () => {
  it('derives capital initials from names, handles and empty input', () => {
    expect(getAvatarInitials('Edward Calderon')).toBe('EC');
    expect(getAvatarInitials('@tiranicida.mtheory')).toBe('TM');
    expect(getAvatarInitials('edward')).toBe('E');
    expect(getAvatarInitials('')).toBe('H');
    expect(getAvatarInitials(null)).toBe('H');
  });

  it('shows the striped initials fallback when there is no photo', () => {
    const r = render({ uri: null, name: 'Edward Calderon' });
    expect(r.root.findAllByType(Image)).toHaveLength(0);
    expect(r.root.findByType(Text).props.children).toBe('EC');
  });

  it('falls back to initials when the photo fails to load', () => {
    const r = render({ uri: 'https://img.example.test/a.png', name: 'Edward' });
    expect(r.root.findAllByType(Image)).toHaveLength(1);
    act(() => { r.root.findByType(Image).props.onError(); });
    expect(r.root.findAllByType(Image)).toHaveLength(0);
    expect(r.root.findByType(Text).props.children).toBe('E');
  });

  it('retries a new photo url after an earlier failure', () => {
    const r = render({ uri: 'https://img.example.test/a.png', name: 'Edward' });
    act(() => { r.root.findByType(Image).props.onError(); });
    act(() => { r.update(<ProfileAvatar isDark={false} uri="https://img.example.test/b.png" name="Edward" />); });
    expect(r.root.findByType(Image).props.source.uri).toBe('https://img.example.test/b.png');
  });
});
