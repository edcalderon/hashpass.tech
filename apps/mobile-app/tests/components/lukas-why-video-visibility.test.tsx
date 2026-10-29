/** @jest-environment jsdom */
/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasCoin', () => ({
  LukasCoin: 'LukasCoin',
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasCoin.css', () => ({}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/useLukasMotion', () => ({
  useSceneActivity: jest.fn(),
}));

import { LukasWhyVideo } from '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasWhyVideo.web';

describe('LukasWhyVideo visibility-aware playback', () => {
  it('does not resume from canplay while the video is offscreen', () => {
    const video = {
      readyState: 0,
      play: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn(),
    };
    const originalObserver = global.IntersectionObserver;
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
    let onIntersection!: (entries: [{ isIntersecting: boolean }]) => void;

    Object.defineProperty(global, 'IntersectionObserver', {
      configurable: true,
      value: jest.fn((callback: typeof onIntersection) => {
        onIntersection = callback;
        return { disconnect: jest.fn(), observe: jest.fn() };
      }),
    });
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });

    try {
      let renderer!: ReturnType<typeof create>;
      act(() => {
        renderer = create(<LukasWhyVideo locale="en" animationLevel="full" isDark={false} />, {
          createNodeMock: (element) => {
            if (element.type === 'video') return video;
            if (element.type === 'div') return {};
            return null;
          },
        });
      });

      act(() => renderer.root.findByProps({ title: 'Play video' }).props.onClick());
      expect(video.play).toHaveBeenCalledTimes(1);

      act(() => onIntersection([{ isIntersecting: false }]));
      expect(video.pause).toHaveBeenCalled();
      const playsBeforeCanPlay = video.play.mock.calls.length;

      act(() => renderer.root.findByType('video' as never).props.onCanPlay());

      expect(video.play).toHaveBeenCalledTimes(playsBeforeCanPlay);
      act(() => renderer.unmount());
    } finally {
      Object.defineProperty(global, 'IntersectionObserver', { configurable: true, value: originalObserver });
      if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor);
      else Reflect.deleteProperty(document, 'hidden');
    }
  });
});
