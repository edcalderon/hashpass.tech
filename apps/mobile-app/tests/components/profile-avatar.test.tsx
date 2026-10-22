/// <reference types="jest" />
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Image, Platform, Text } from 'react-native';
import ProfileAvatar, { getAvatarInitials } from '../../components/ProfileAvatar';

const render = (props: Partial<React.ComponentProps<typeof ProfileAvatar>>) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => { r = TestRenderer.create(<ProfileAvatar isDark={false} {...props} />); });
  return r;
};

describe('ProfileAvatar', () => {
  const originalOs = Platform.OS;
  beforeEach(() => { Platform.OS = 'ios'; });
  afterEach(() => { Platform.OS = originalOs; });

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

  it('renders the dark fallback with a labelled name and custom initials size', () => {
    const r = render({ uri: undefined, name: 'Ada Lovelace', isDark: true, initialsSize: 30 });
    const label = r.root.find((n) => n.props.accessibilityLabel === 'Ada Lovelace');
    expect(label).toBeTruthy();
    expect(r.root.findByType(Text).props.style).toEqual(expect.objectContaining({ fontSize: 30 }));
  });

  it('shows the default initial and no label when there is no name', () => {
    const r = render({ uri: null, name: null });
    expect(r.root.findByType(Text).props.children).toBe('H');
    expect(r.root.findAll((n) => n.props.accessibilityLabel !== undefined && n.props.accessibilityLabel !== null && typeof n.props.accessibilityLabel === 'string')).toHaveLength(0);
  });

  describe('on web', () => {
    beforeEach(() => { Platform.OS = 'web'; });

    it('loads the photo without a referrer so Google avatars are not rate limited', () => {
      const r = render({ uri: 'https://lh3.googleusercontent.com/a/x=s96-c', name: 'Edward' });
      const img = r.root.findByType('img');
      expect(img.props.src).toBe('https://lh3.googleusercontent.com/a/x=s96-c');
      expect(img.props.referrerPolicy).toBe('no-referrer');
      expect(r.root.findAllByType(Image)).toHaveLength(0);
    });

    it('falls back to initials when the web photo fails', () => {
      const r = render({ uri: 'https://img.example.test/a.png', name: 'Edward' });
      act(() => { r.root.findByType('img').props.onError(); });
      expect(r.root.findAllByType('img')).toHaveLength(0);
      expect(r.root.findByType(Text).props.children).toBe('E');
    });
  });
});
