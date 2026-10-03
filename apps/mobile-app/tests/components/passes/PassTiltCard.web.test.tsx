/// <reference types="jest" />

import React from 'react';
import { act, create } from 'react-test-renderer';

import PassTiltCard, { PassDepthLayer } from '../../../components/passes/PassTiltCard.web';
import { resolveWebPassMotionPreferences } from '../../../components/passes/pass-motion-preferences';

const render = (element: React.ReactElement) => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

// react-test-renderer doesn't create real DOM nodes, so refs to the raw
// <div>s need createNodeMock to resolve to something with .style and
// .getBoundingClientRect -- otherwise handleMove/reset's ref.current guards
// always short-circuit as null and the pointer-tracking body never runs.
// PassTiltCard attaches exactly three refs (outer, inner, sheen). Fiber's
// "complete work" phase creates host instances bottom-up (children before
// parents), so createNodeMock fires for the sheen div first, then inner,
// then outer last. The clipping wrapper has no ref, so createdNodes remains
// in that same [sheen, inner, outer] order. getBoundingClientRect is handed
// to every mock (not just outer's) since only the real outer node ever calls
// it, and guessing which index is "last" would be fragile if the component's
// ref count ever changes.
const renderWithDomRefs = (element: React.ReactElement) => {
  const createdNodes: Array<{ style: Record<string, string>; getBoundingClientRect: () => DOMRect }> = [];
  const createNodeMock = () => {
    const node = {
      style: {} as Record<string, string>,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 400 }) as DOMRect,
    };
    createdNodes.push(node);
    return node;
  };

  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(element, { createNodeMock });
  });
  return { renderer: renderer!, createdNodes };
};

describe('PassTiltCard.web', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn((query: string) => ({
        matches: query === '(hover: hover) and (pointer: fine)',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    });
  });

  it('uses a 2D fallback for touch WebKit/PWA environments', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)' ? false : false,
    })) as unknown as (query: string) => MediaQueryList;

    expect(resolveWebPassMotionPreferences(matchMedia)).toEqual({
      supports3d: false,
      reducedMotion: false,
    });
  });

  it('enables the optional 3D treatment only for fine-pointer desktops', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
    })) as unknown as (query: string) => MediaQueryList;

    expect(resolveWebPassMotionPreferences(matchMedia)).toEqual({
      supports3d: true,
      reducedMotion: false,
    });
  });

  it('forces the bounded 2D presentation when CSS 3D primitives are unavailable', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
    })) as unknown as (query: string) => MediaQueryList;

    expect(resolveWebPassMotionPreferences(matchMedia, false)).toEqual({
      supports3d: false,
      reducedMotion: false,
    });
  });

  it('honors system reduced motion even on a fine-pointer desktop', () => {
    const matchMedia = jest.fn((query: string) => ({
      matches: true,
    })) as unknown as (query: string) => MediaQueryList;

    expect(resolveWebPassMotionPreferences(matchMedia)).toEqual({
      supports3d: false,
      reducedMotion: true,
    });
  });

  it('renders the stable 2D shell for touch PWA browsers', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    const renderer = render(<PassTiltCard>Pass face</PassTiltCard>);
    const [outer, clippingShell, inner] = renderer.root.findAllByType('div');

    expect(outer.props.onPointerMove).toBeUndefined();
    expect(clippingShell.props.style.overflow).toBe('hidden');
    expect(inner.props.style.transformStyle).toBeUndefined();
    expect(inner.props.style.transform).toBeUndefined();
    expect(inner.props.style.willChange).toBeUndefined();
    expect(inner.props.style.overflow).toBeUndefined();
  });

  it('keeps the 3D context unclipped behind a separate clipping shell', () => {
    const renderer = render(<PassTiltCard>Pass face</PassTiltCard>);
    const [outer, clippingShell, inner] = renderer.root.findAllByType('div');

    expect(outer.props.style.perspective).toBe('1100px');
    expect(clippingShell.props.style.overflow).toBe('hidden');
    expect(inner.props.style.transformStyle).toBe('preserve-3d');
    expect(inner.props.style.overflow).toBeUndefined();
  });

  it('does not leave translateZ layers active in the touch fallback', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    });

    const renderer = render(
      <PassDepthLayer depth={12}>
        <div>Layer content</div>
      </PassDepthLayer>,
    );
    const layer = renderer.root.findByType('div');

    expect(layer.props.style.transform).toBeUndefined();
    expect(layer.props.style.transformStyle).toBeUndefined();
  });

  it('keeps depth layers in the card 3D context', () => {
    const renderer = render(
      <PassDepthLayer depth={12} pointerEvents="none" style={{ opacity: 0.8 }}>
        <div>Layer content</div>
      </PassDepthLayer>,
    );
    const layer = renderer.root.findByType('div');

    expect(layer.props.style).toMatchObject({
      opacity: 0.8,
      transform: 'translateZ(12px)',
      transformStyle: 'preserve-3d',
      pointerEvents: 'none',
    });
  });

  it('defaults depth to 0 and leaves pointerEvents undefined when not "none"', () => {
    const renderer = render(
      <PassDepthLayer>
        <div>Layer content</div>
      </PassDepthLayer>,
    );
    const layer = renderer.root.findByType('div');

    expect(layer.props.style.transform).toBe('translateZ(0px)');
    expect(layer.props.style.pointerEvents).toBeUndefined();
  });

  it('renders the interactive shell and forwards clicks without React animation state', () => {
    const onPress = jest.fn();
    const renderer = render(
      <PassTiltCard accentColor="#007AFF" onPress={onPress}>
        <div>Pass face</div>
      </PassTiltCard>,
    );
    const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onClick === 'function');

    expect(outer).toBeTruthy();
    expect(outer?.props.style.cursor).toBe('pointer');
    expect(outer?.props.style.perspective).toBe('1100px');

    act(() => {
      outer?.props.onClick();
      outer?.props.onPointerLeave();
      outer?.props.onPointerCancel();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not advertise pointer interactivity when no click handler exists', () => {
    const renderer = render(<PassTiltCard>Pass face</PassTiltCard>);
    const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');

    expect(outer?.props.style.cursor).toBeUndefined();
  });

  describe('pointer tilt tracking', () => {
    let rafCallbacks: FrameRequestCallback[];
    let originalRaf: typeof requestAnimationFrame;
    let originalCancelRaf: typeof cancelAnimationFrame;

    beforeEach(() => {
      rafCallbacks = [];
      originalRaf = global.requestAnimationFrame;
      originalCancelRaf = global.cancelAnimationFrame;
      // Deterministic: capture the frame instead of scheduling it, so the
      // test controls exactly when handleMove's rAF body runs.
      global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      }) as typeof requestAnimationFrame;
      global.cancelAnimationFrame = jest.fn();
    });

    afterEach(() => {
      global.requestAnimationFrame = originalRaf;
      global.cancelAnimationFrame = originalCancelRaf;
    });

    const flushFrames = () => {
      const pending = rafCallbacks;
      rafCallbacks = [];
      pending.forEach((cb) => cb(0));
    };

    it('rotates toward the pointer and shows a tracking sheen, then relaxes back on leave', () => {
      const { renderer, createdNodes } = renderWithDomRefs(
        <PassTiltCard accentColor="#34A853" isDark>
          <div>Pass face</div>
        </PassTiltCard>,
      );
      const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');
      const [sheenMock, innerMock] = createdNodes;

      act(() => {
        // Pointer offset from centre: px=0.25, py=-0.25 (top-right quadrant).
        outer!.props.onPointerMove({ clientX: 225, clientY: 100 });
        flushFrames();
      });

      expect(innerMock.style.transform).toContain('rotateX(4.50deg)');
      expect(innerMock.style.transform).toContain('rotateY(4.50deg)');
      expect(sheenMock.style.opacity).toBe('0.5');
      expect(sheenMock.style.background).toContain('75.0% 25.0%');
      expect(sheenMock.style.background).toContain('rgba(255,255,255,0.22)');

      act(() => {
        outer!.props.onPointerLeave();
      });

      expect(innerMock.style.transform).toBe(
        'perspective(1100px) rotateX(0deg) rotateY(0deg) translateZ(0px)',
      );
      expect(sheenMock.style.opacity).toBe('0');
    });

    it('uses the light-mode sheen colors when isDark is false', () => {
      const { renderer, createdNodes } = renderWithDomRefs(
        <PassTiltCard>
          <div>Pass face</div>
        </PassTiltCard>,
      );
      const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');
      const [sheenMock] = createdNodes;

      act(() => {
        outer!.props.onPointerMove({ clientX: 150, clientY: 200 });
        flushFrames();
      });

      expect(sheenMock.style.opacity).toBe('0.35');
      expect(sheenMock.style.background).toContain('rgba(255,255,255,0.85)');
    });

    it('does nothing when disabled', () => {
      const { renderer } = renderWithDomRefs(
        <PassTiltCard disabled>
          <div>Pass face</div>
        </PassTiltCard>,
      );
      const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');

      act(() => {
        outer!.props.onPointerMove({ clientX: 10, clientY: 10 });
      });

      // disabled short-circuits before ever touching rAF.
      expect(rafCallbacks).toHaveLength(0);
    });

    it('cancels a pending frame when the pointer moves again before it fires', () => {
      const { renderer } = renderWithDomRefs(
        <PassTiltCard>
          <div>Pass face</div>
        </PassTiltCard>,
      );
      const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');

      act(() => {
        outer!.props.onPointerMove({ clientX: 10, clientY: 10 });
        outer!.props.onPointerMove({ clientX: 20, clientY: 20 });
      });

      expect(global.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it('cancels a still-pending frame when the pointer leaves before it fires', () => {
      const { renderer } = renderWithDomRefs(
        <PassTiltCard>
          <div>Pass face</div>
        </PassTiltCard>,
      );
      const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');

      act(() => {
        // Schedule a frame but never flush it, so it's still pending when
        // reset() runs -- exercises reset()'s own cancellation branch,
        // distinct from handleMove's "supersede the previous frame" cancel.
        outer!.props.onPointerMove({ clientX: 10, clientY: 10 });
        outer!.props.onPointerLeave();
      });

      expect(global.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    });

    it('cancels any pending frame on unmount', () => {
      const { renderer } = renderWithDomRefs(
        <PassTiltCard>
          <div>Pass face</div>
        </PassTiltCard>,
      );
      const outer = renderer.root.findAllByType('div').find((node) => typeof node.props.onPointerMove === 'function');

      act(() => {
        outer!.props.onPointerMove({ clientX: 10, clientY: 10 });
      });

      act(() => {
        renderer.unmount();
      });

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});
