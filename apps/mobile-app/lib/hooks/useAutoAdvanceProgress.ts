import { useCallback, useEffect, useRef, useState } from "react";
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

interface UseAutoAdvanceProgressOptions {
  /** Number of slides. 0 or 1 disables auto-advance entirely. */
  count: number;
  /** Per-slide duration in ms, given the slide index. */
  durationMs: (index: number) => number;
  /** Changing this restarts the sequence at slide 0 (e.g. a new selected event). */
  resetKey?: unknown;
  /** Slide to start on. Only read once, on mount. Defaults to 0. */
  initialIndex?: number;
}

interface UseAutoAdvanceProgressResult {
  activeIndex: number;
  /** 0..1 fill of the active slide, driven on the UI thread. */
  progress: SharedValue<number>;
  /** Freezes the active slide's fill in place. */
  pause: () => void;
  /** Continues the active slide's fill from where it was paused. */
  resume: () => void;
  /** Jumps to a slide and restarts its fill from 0. */
  goTo: (index: number) => void;
}

/**
 * Drives an Instagram-Stories-style auto-advancing slide sequence: one
 * Reanimated shared value fills 0->1 over the active slide's duration, then
 * advances to the next slide. pause()/resume() freeze and continue the fill
 * in place rather than restarting it, so a press-and-hold genuinely pauses
 * the slide instead of resetting it.
 *
 * Shared by every slider/banner in the app that needs this behavior (see
 * components/banner/SliderProgressBar.tsx for the matching progress-bar UI)
 * instead of each screen re-implementing its own setInterval + Date.now().
 */
export function useAutoAdvanceProgress({
  count,
  durationMs,
  resetKey,
  initialIndex = 0,
}: UseAutoAdvanceProgressOptions): UseAutoAdvanceProgressResult {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const progress = useSharedValue(0);
  const pausedRef = useRef(false);
  const activeIndexRef = useRef(initialIndex);
  activeIndexRef.current = activeIndex;
  // The resetKey effect below must not stomp initialIndex on the very first
  // run -- every effect runs once on mount regardless of its dependencies,
  // and resetKey is often undefined on mount (see the bug this guards).
  const isFirstResetRef = useRef(true);

  const advance = useCallback(() => {
    setActiveIndex((current) =>
      count <= 0 ? 0 : (current + 1) % count,
    );
  }, [count]);

  const startSegment = useCallback(
    (fromProgress: number) => {
      if (count <= 1) {
        progress.value = 0;
        return;
      }
      const total = Math.max(1, durationMs(activeIndexRef.current));
      const remaining = total * (1 - fromProgress);
      progress.value = fromProgress;
      progress.value = withTiming(
        1,
        { duration: remaining, easing: Easing.linear },
        (finished) => {
          "worklet";
          if (finished) {
            runOnJS(advance)();
          }
        },
      );
    },
    [advance, count, durationMs, progress],
  );

  // New active slide (including after goTo/advance): start its fill from 0.
  useEffect(() => {
    pausedRef.current = false;
    startSegment(0);
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, count]);

  // resetKey changing (e.g. a different event selected) restarts from slide 0.
  useEffect(() => {
    if (isFirstResetRef.current) {
      // Mount: the effect above already started initialIndex's segment.
      isFirstResetRef.current = false;
      return;
    }
    pausedRef.current = false;
    if (activeIndexRef.current === 0) {
      // setActiveIndex(0) would be a no-op when already on slide 0, so the
      // effect above would never rerun and the segment would stay frozen at
      // whatever progress it had when resetKey changed. Restart explicitly.
      cancelAnimation(progress);
      startSegment(0);
    } else {
      cancelAnimation(progress);
      setActiveIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const pause = useCallback(() => {
    if (pausedRef.current || count <= 1) return;
    pausedRef.current = true;
    cancelAnimation(progress);
  }, [count, progress]);

  const resume = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    startSegment(progress.value);
  }, [progress, startSegment]);

  const goTo = useCallback(
    (index: number) => {
      pausedRef.current = false;
      if (index === activeIndexRef.current) {
        // setActiveIndex(index) would be a no-op for the already-active
        // segment, so the start-segment effect above would never rerun and
        // the fill would stay frozen wherever cancelAnimation left it.
        // Restart explicitly instead.
        startSegment(0);
        return;
      }
      cancelAnimation(progress);
      setActiveIndex(index);
    },
    [progress, startSegment],
  );

  return { activeIndex, progress, pause, resume, goTo };
}
