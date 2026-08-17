/// <reference types="jest" />

// Local, instrumented reanimated mock (jest.fn() spies on withTiming/
// cancelAnimation) instead of the global jest.setup.cjs mock, since these
// tests need to assert exactly when a new segment timing animation starts
// -- that's precisely the behavior the two bugs below broke.
const mockWithTiming = jest.fn(
  (toValue: number, _config?: unknown, _callback?: (finished: boolean) => void) =>
    toValue,
);
const mockCancelAnimation = jest.fn();

jest.mock("react-native-reanimated", () => {
  const ReactActual = require("react");
  return {
    __esModule: true,
    useSharedValue: (initial: number) => {
      const ref: { current: { value: number } | undefined } =
        ReactActual.useRef(undefined);
      if (ref.current === undefined) ref.current = { value: initial };
      return ref.current;
    },
    withTiming: (...args: unknown[]) => (mockWithTiming as any)(...args),
    cancelAnimation: (...args: unknown[]) => (mockCancelAnimation as any)(...args),
    runOnJS:
      (fn: (...a: unknown[]) => void) =>
      (...a: unknown[]) =>
        fn(...a),
    Easing: { linear: (t: number) => t },
  };
});

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useAutoAdvanceProgress } from "../../../lib/hooks/useAutoAdvanceProgress";

// Deliberately not `Parameters<typeof useAutoAdvanceProgress>[0]`: the repo's
// changed-file typecheck sandbox (packages/tools/scripts/typecheck-changed.mjs)
// stubs out local relative imports with a loose auto-generated signature
// instead of using the real source, which collapses a derived type like this
// down to something JSX prop-checking rejects. Spelling it out matches
// UseAutoAdvanceProgressOptions in lib/hooks/useAutoAdvanceProgress.ts --
// keep the two in sync if that shape changes.
interface HookProps {
  count: number;
  durationMs: (index: number) => number;
  resetKey?: unknown;
  initialIndex?: number;
}
type HookResult = ReturnType<typeof useAutoAdvanceProgress>;

let latest: HookResult | null = null;

function Capture(props: HookProps) {
  latest = useAutoAdvanceProgress(props);
  return null;
}

const renderHook = (props: HookProps) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Capture {...props} />);
  });
  return renderer;
};

describe("useAutoAdvanceProgress", () => {
  beforeEach(() => {
    mockWithTiming.mockClear();
    mockCancelAnimation.mockClear();
    latest = null;
  });

  it("starts on initialIndex rather than always slide 0", () => {
    renderHook({ count: 4, durationMs: () => 5000, initialIndex: 2 });
    expect(latest?.activeIndex).toBe(2);
  });

  it("starts exactly one timing animation on mount", () => {
    renderHook({ count: 3, durationMs: () => 5000 });
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
  });

  it("does not let the resetKey effect override initialIndex on mount", () => {
    // A resetKey present from the very first render (e.g. an already-set
    // selectedEvent id) must not be treated as a "changed" reset -- only
    // the mount-time start-segment effect should fire, not a second one
    // from the resetKey effect stomping activeIndex back to 0.
    renderHook({
      count: 2,
      durationMs: () => 5000,
      initialIndex: 1,
      resetKey: "event-a",
    });
    expect(latest?.activeIndex).toBe(1);
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
  });

  it("advances to a different slide and restarts its timing on tap", () => {
    const renderer = renderHook({ count: 3, durationMs: () => 5000 });
    mockWithTiming.mockClear();

    act(() => {
      latest!.goTo(2);
    });

    expect(latest?.activeIndex).toBe(2);
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
  });

  it("restarts the timing when the already-active slide is tapped again (regression)", () => {
    // Previously: goTo(activeIndex) called setActiveIndex with the current
    // value, a same-value no-op that never re-runs the start-segment
    // effect. The fill stayed frozen wherever cancelAnimation left it,
    // forever, until a genuinely different index was picked.
    const renderer = renderHook({ count: 3, durationMs: () => 5000 });
    mockWithTiming.mockClear();

    act(() => {
      latest!.goTo(0);
    });

    expect(latest?.activeIndex).toBe(0);
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
  });

  it("restarts the timing when resetKey changes while already on slide 0 (regression)", () => {
    // Previously: the resetKey effect called setActiveIndex(0), a
    // same-value no-op whenever the sequence was already on slide 0 (e.g.
    // selecting a second event while still viewing the first event's
    // opening slide). The effect that starts a segment's timing never
    // reran, so the new event's hero stayed frozen at the old progress.
    const renderer = renderHook({
      count: 3,
      durationMs: () => 5000,
      resetKey: "event-a",
    });
    mockWithTiming.mockClear();

    act(() => {
      renderer.update(
        <Capture count={3} durationMs={() => 5000} resetKey="event-b" />,
      );
    });

    expect(latest?.activeIndex).toBe(0);
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    act(() => {
      renderer.unmount();
    });
  });

  it("pause freezes the fill; resume continues it from where it left off instead of restarting", () => {
    const renderer = renderHook({ count: 3, durationMs: () => 10000 });
    latest!.progress.value = 0.4; // simulate 40% elapsed
    mockWithTiming.mockClear();

    act(() => {
      latest!.pause();
    });
    expect(mockCancelAnimation).toHaveBeenCalledTimes(1);
    expect(mockWithTiming).not.toHaveBeenCalled();

    act(() => {
      latest!.resume();
    });
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    const [, config] = mockWithTiming.mock.calls[0] as [
      number,
      { duration: number },
    ];
    // Resumes over the remaining 60% of the duration, not the full 10s.
    expect(config.duration).toBeCloseTo(10000 * 0.6, 0);
    act(() => {
      renderer.unmount();
    });
  });

  it("resume is a no-op when not currently paused", () => {
    const renderer = renderHook({ count: 3, durationMs: () => 5000 });
    mockWithTiming.mockClear();

    act(() => {
      latest!.resume();
    });

    expect(mockWithTiming).not.toHaveBeenCalled();
    act(() => {
      renderer.unmount();
    });
  });

  it("disables auto-advance entirely for a single slide", () => {
    renderHook({ count: 1, durationMs: () => 5000 });
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(latest?.activeIndex).toBe(0);
  });

  it("disables auto-advance entirely for zero slides", () => {
    renderHook({ count: 0, durationMs: () => 5000 });
    expect(mockWithTiming).not.toHaveBeenCalled();
  });
});
