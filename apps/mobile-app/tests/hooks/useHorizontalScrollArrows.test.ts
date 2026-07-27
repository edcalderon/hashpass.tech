/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

// Real behavioral coverage for the shared horizontal-scroll-with-arrows hook
// (Quick Access, Select Event, QuickAccessGrid). Uses a harness component +
// react-test-renderer, following the pattern already established in
// tests/contexts/ToastContext.test.tsx and tests/app/home.test.tsx for
// testing hooks without @testing-library/react-hooks.

describe('useHorizontalScrollArrows', () => {
  const platformState: { OS: string } = { OS: 'ios' };

  const loadHook = () => {
    jest.resetModules();

    jest.doMock('react-native', () => ({
      Platform: {
        get OS() {
          return platformState.OS;
        },
        select: (opts: Record<string, unknown>) =>
          platformState.OS in opts ? opts[platformState.OS] : opts.default,
      },
      ScrollView: 'ScrollView',
    }));

    jest.doMock('react-native-reanimated', () => ({
      __esModule: true,
      // Real reanimated shared values persist the same mutable object across
      // re-renders. A plain `(value) => ({ value })` would hand back a fresh
      // object every render and silently discard prior mutations, so this
      // backs it with useRef to match real persistence semantics.
      useSharedValue: (initial: unknown) => require('react').useRef({ value: initial }).current,
      useAnimatedStyle: (factory: () => unknown) => factory(),
    }));

    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { useHorizontalScrollArrows } = require('../../hooks/useHorizontalScrollArrows');
    return { React, TestRenderer, useHorizontalScrollArrows };
  };

  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('react-native-reanimated');
    platformState.OS = 'ios';
  });

  function renderScrollHook(options: {
    cardWidth: number;
    cardSpacing: number;
    androidFallbackWidth?: number;
  }) {
    const { React, TestRenderer, useHorizontalScrollArrows } = loadHook();
    let hookResult: any;

    const Harness = () => {
      hookResult = useHorizontalScrollArrows(options);
      return null;
    };

    let renderer: any;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    return {
      get current() {
        return hookResult;
      },
      act: (fn: () => void) => TestRenderer.act(fn),
      unmount: () => TestRenderer.act(() => renderer.unmount()),
    };
  }

  const scrollEvent = (x: number, contentWidth: number, viewportWidth: number) => ({
    nativeEvent: {
      contentOffset: { x },
      contentSize: { width: contentWidth },
      layoutMeasurement: { width: viewportWidth },
    },
  });

  it('starts with both arrows hidden', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });
    expect(hook.current.canScrollLeft).toBe(false);
    expect(hook.current.canScrollRight).toBe(false);
    expect(hook.current.leftArrowStyle).toEqual({ opacity: 0 });
    expect(hook.current.rightArrowStyle).toEqual({ opacity: 0 });
  });

  it('aliases drag/momentum handlers to the same handleScroll function', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });
    expect(hook.current.handleScrollBeginDrag).toBe(hook.current.handleScroll);
    expect(hook.current.handleScrollEndDrag).toBe(hook.current.handleScroll);
    expect(hook.current.handleMomentumScrollEnd).toBe(hook.current.handleScroll);
  });

  it('updates arrow visibility as real scroll events come in', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });

    hook.act(() => hook.current.handleScroll(scrollEvent(50, 1000, 300)));
    expect(hook.current.canScrollLeft).toBe(true);
    expect(hook.current.canScrollRight).toBe(true);
    expect(hook.current.leftArrowStyle).toEqual({ opacity: 1 });

    // Within 10px of the end -> right arrow hides
    hook.act(() => hook.current.handleScroll(scrollEvent(695, 1000, 300)));
    expect(hook.current.canScrollRight).toBe(false);

    // Back at the start -> left arrow hides
    hook.act(() => hook.current.handleScroll(scrollEvent(0, 1000, 300)));
    expect(hook.current.canScrollLeft).toBe(false);
    expect(hook.current.leftArrowStyle).toEqual({ opacity: 0 });
  });

  it('handleLayout recalculates max scroll from the reported viewport width', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });

    hook.act(() => hook.current.handleContentSizeChange(1000));
    hook.act(() => hook.current.handleLayout({ nativeEvent: { layout: { width: 300 } } }));
    expect(hook.current.canScrollRight).toBe(true);

    // Missing layout width falls back to 0, per `e?.nativeEvent?.layout?.width || 0`
    hook.act(() => hook.current.handleLayout({ nativeEvent: {} }));
    expect(hook.current.canScrollRight).toBe(true);
  });

  it('handleWheel scrolls horizontally, prefers the larger axis delta, and clamps to bounds', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });
    hook.act(() => hook.current.handleScroll(scrollEvent(0, 1000, 300)));

    const scrollTo = jest.fn();
    hook.current.scrollRef.current = { scrollTo };
    const preventDefault = jest.fn();

    hook.act(() => hook.current.handleWheel({ deltaX: 0, deltaY: 120, preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ x: 120, animated: false });

    // nativeEvent-wrapped shape (native platforms) is read the same way
    scrollTo.mockClear();
    hook.act(() => hook.current.handleWheel({ nativeEvent: { deltaX: 40, deltaY: 0 } }));
    expect(scrollTo).toHaveBeenCalledWith({ x: 40, animated: false });

    // Large deltas clamp to maxScrollX (1000 - 300 = 700)
    scrollTo.mockClear();
    hook.act(() => hook.current.handleWheel({ deltaX: 0, deltaY: 5000 }));
    expect(scrollTo).toHaveBeenCalledWith({ x: 700, animated: false });

    // Negative deltas clamp to 0
    scrollTo.mockClear();
    hook.act(() => hook.current.handleWheel({ deltaX: 0, deltaY: -5000 }));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: false });
  });

  it('scroll() moves by a viewport-aware amount and respects both boundaries', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });
    hook.act(() => hook.current.handleScroll(scrollEvent(200, 1000, 300)));

    const scrollTo = jest.fn();
    hook.current.scrollRef.current = { scrollTo };

    // viewportWidth(300) > cardWidth*2(200) -> scrollAmount = min(300-10, 200) = 200
    hook.act(() => hook.current.scroll('left'));
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, animated: true });

    scrollTo.mockClear();
    hook.act(() => hook.current.scroll('right'));
    expect(scrollTo).toHaveBeenCalledWith({ x: 400, animated: true });

    // At the start boundary, scrolling left is a no-op
    hook.act(() => hook.current.handleScroll(scrollEvent(0, 1000, 300)));
    scrollTo.mockClear();
    hook.act(() => hook.current.scroll('left'));
    expect(scrollTo).not.toHaveBeenCalled();

    // At the end boundary, scrolling right is a no-op
    hook.act(() => hook.current.handleScroll(scrollEvent(700, 1000, 300)));
    scrollTo.mockClear();
    hook.act(() => hook.current.scroll('right'));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scroll() is a no-op before the ScrollView ref is attached', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });
    expect(() => hook.act(() => hook.current.scroll('left'))).not.toThrow();
  });

  it('backfills the Android viewport width from androidFallbackWidth when layout reports zero', () => {
    platformState.OS = 'android';
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10, androidFallbackWidth: 300 });

    hook.act(() => hook.current.handleContentSizeChange(1000));
    expect(hook.current.canScrollRight).toBe(true);

    const scrollTo = jest.fn();
    hook.current.scrollRef.current = { scrollTo };
    // Confirms the backfilled viewport width (300) drove the scroll amount:
    // min(300-10, 200) = 200, not the un-backfilled default of cardWidth+cardSpacing (110).
    hook.act(() => hook.current.scroll('right'));
    expect(scrollTo).toHaveBeenCalledWith({ x: 200, animated: true });
  });

  it('does not apply the Android fallback width on other platforms', () => {
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10, androidFallbackWidth: 300 });

    hook.act(() => hook.current.handleContentSizeChange(1000));

    const scrollTo = jest.fn();
    hook.current.scrollRef.current = { scrollTo };
    // viewportWidthRef stays 0 -> scroll() falls back to cardWidth + cardSpacing = 110
    hook.act(() => hook.current.scroll('right'));
    expect(scrollTo).toHaveBeenCalledWith({ x: 110, animated: true });
  });

  it('sets up and tears down the web scroll-DOM-fallback effect without crashing', () => {
    jest.useFakeTimers();
    platformState.OS = 'web';
    const hook = renderScrollHook({ cardWidth: 100, cardSpacing: 10 });

    // scrollRef.current is null in this harness, so the effect's deferred
    // setup exits early once the 500ms timeout fires -- exercises the
    // web-only branch and its guard without needing a real DOM ref.
    expect(() => hook.act(() => jest.advanceTimersByTime(600))).not.toThrow();
    expect(() => hook.unmount()).not.toThrow();

    jest.useRealTimers();
  });
});
