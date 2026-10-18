/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import SpeakerAvatar from '../../components/SpeakerAvatar';

function renderAvatar(props: React.ComponentProps<typeof SpeakerAvatar>) {
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<SpeakerAvatar {...props} />);
  });

  return renderer;
}

function images(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType('Image' as any);
}

function initials(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType('Text' as any).props.children;
}

describe('SpeakerAvatar', () => {
  it('advances from the profile image to the fallback and then initials', () => {
    const renderer = renderAvatar({
      name: 'Ada Lovelace',
      imageUrl: 'https://cdn.test/ada.png',
      fallbackImageUrl: 'https://cdn.test/ada-fallback.png',
    });

    expect(images(renderer)).toHaveLength(1);
    expect(images(renderer)[0].props.source).toEqual({
      uri: 'https://cdn.test/ada.png',
    });

    // Calling the original handler twice covers the idempotent state updater
    // as well as the normal transition to the next candidate URL.
    const profileImageError = images(renderer)[0].props.onError;
    act(() => {
      profileImageError();
      profileImageError();
    });

    expect(images(renderer)[0].props.source).toEqual({
      uri: 'https://cdn.test/ada-fallback.png',
    });

    act(() => images(renderer)[0].props.onError());
    expect(images(renderer)).toHaveLength(0);
    expect(initials(renderer)).toBe('AL');
    expect(renderer.root.findByType('View' as any).props.accessibilityLabel).toBe(
      'Ada Lovelace avatar placeholder',
    );

    act(() => renderer.unmount());
  });

  it('deduplicates identical image URLs before falling back to initials', () => {
    const renderer = renderAvatar({
      name: 'Grace Hopper',
      imageUrl: 'https://cdn.test/grace.png',
      fallbackImageUrl: 'https://cdn.test/grace.png',
    });

    expect(images(renderer)).toHaveLength(1);
    act(() => images(renderer)[0].props.onError());

    expect(images(renderer)).toHaveLength(0);
    expect(initials(renderer)).toBe('GH');

    act(() => renderer.unmount());
  });

  it('renders initials when both image sources are missing', () => {
    const renderer = renderAvatar({ name: 'Alan Turing', imageUrl: '', fallbackImageUrl: null });

    expect(images(renderer)).toHaveLength(0);
    expect(initials(renderer)).toBe('AT');

    act(() => renderer.unmount());
  });
});
