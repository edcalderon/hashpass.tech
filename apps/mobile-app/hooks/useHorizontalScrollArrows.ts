import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView } from 'react-native';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

interface UseHorizontalScrollArrowsOptions {
  cardWidth: number;
  cardSpacing: number;
  // Android's onLayout for a horizontal ScrollView reports 0 before the first
  // real layout pass in some cases; when set, this backfills the viewport
  // width from the window so the very first arrow-visibility check isn't
  // wrong. Matches the historical workaround already used for Quick Access.
  androidFallbackWidth?: number;
}

// Shared by every horizontally-scrollable card row with arrow affordances
// (Quick Access, Select Event, QuickAccessGrid). Handles three things a
// plain <ScrollView horizontal> doesn't give you for free:
//   1. Arrows that are only mounted (not just dimmed) once there's actually
//      somewhere to scroll to in that direction -- a dimmed-but-present
//      arrow at the very start/end reads as broken, not as "disabled".
//   2. Mouse wheel -> horizontal scroll translation on web, since desktop
//      browsers don't turn a vertical wheel gesture into horizontal scroll
//      on their own, and RN Web's ScrollView doesn't support click-and-drag
//      panning like a touch surface does.
//   3. A DOM-level 'scroll' listener fallback on web so arrow state stays in
//      sync even when native scroll (trackpad, scrollbar drag) drives the
//      scroll position instead of RN's onScroll.
export function useHorizontalScrollArrows({
  cardWidth,
  cardSpacing,
  androidFallbackWidth,
}: UseHorizontalScrollArrowsOptions) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollXRef = useRef(0);
  const maxScrollXRef = useRef(0);
  const viewportWidthRef = useRef(0);
  const contentWidthRef = useRef(0);

  const leftArrowOpacity = useSharedValue(0);
  const rightArrowOpacity = useSharedValue(0);
  const leftArrowStyle = useAnimatedStyle(() => ({ opacity: leftArrowOpacity.value }));
  const rightArrowStyle = useAnimatedStyle(() => ({ opacity: rightArrowOpacity.value }));

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback((scrollX: number, maxScrollX: number) => {
    const left = scrollX > 0;
    const right = scrollX < maxScrollX - 10;

    leftArrowOpacity.value = left ? 1 : 0;
    rightArrowOpacity.value = right ? 1 : 0;
    setCanScrollLeft(left);
    setCanScrollRight(right);
  }, [leftArrowOpacity, rightArrowOpacity]);

  const handleWheel = useCallback((e: any) => {
    const dx = e?.nativeEvent?.deltaX ?? e?.deltaX ?? 0;
    const dy = e?.nativeEvent?.deltaY ?? e?.deltaY ?? 0;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const nextX = Math.max(0, Math.min(scrollXRef.current + delta, maxScrollXRef.current));

    if (typeof e?.preventDefault === 'function') {
      e.preventDefault();
    }

    scrollRef.current?.scrollTo({ x: nextX, animated: false });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const currentScrollX = contentOffset.x;
    const currentMaxScrollX = contentSize.width - layoutMeasurement.width;

    scrollXRef.current = currentScrollX;
    maxScrollXRef.current = currentMaxScrollX;
    viewportWidthRef.current = layoutMeasurement.width;
    contentWidthRef.current = contentSize.width;
    updateArrows(currentScrollX, currentMaxScrollX);
  }, [updateArrows]);

  const handleLayout = useCallback((e: any) => {
    const w = e?.nativeEvent?.layout?.width || 0;
    viewportWidthRef.current = w;
    maxScrollXRef.current = Math.max(0, contentWidthRef.current - w);
    updateArrows(scrollXRef.current, maxScrollXRef.current);
  }, [updateArrows]);

  const handleContentSizeChange = useCallback((w: number) => {
    contentWidthRef.current = w;
    if (Platform.OS === 'android' && viewportWidthRef.current <= 0 && androidFallbackWidth) {
      viewportWidthRef.current = androidFallbackWidth;
    }
    maxScrollXRef.current = Math.max(0, w - viewportWidthRef.current);
    updateArrows(scrollXRef.current, maxScrollXRef.current);
  }, [updateArrows, androidFallbackWidth]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;

    const scrollAmount = viewportWidthRef.current > 0 && viewportWidthRef.current > cardWidth * 2
      ? Math.min(viewportWidthRef.current - cardSpacing, cardWidth * 2)
      : cardWidth + cardSpacing;

    const currentScrollX = scrollXRef.current || 0;
    const target = direction === 'left'
      ? Math.max(0, currentScrollX - scrollAmount)
      : Math.min(maxScrollXRef.current, currentScrollX + scrollAmount);

    if ((direction === 'left' && currentScrollX > 0) ||
        (direction === 'right' && currentScrollX < maxScrollXRef.current)) {
      scrollRef.current.scrollTo({ x: target, animated: true });
    }
  }, [cardWidth, cardSpacing]);

  // Web-specific scroll detection using DOM events (fallback for native
  // scroll/trackpad/scrollbar-drag, which don't always fire RN's onScroll
  // in react-native-web).
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let scrollElement: HTMLElement | null = null;
    let cleanupFn: (() => void) | null = null;

    const timeoutId = setTimeout(() => {
      try {
        const scrollRefCurrent = scrollRef.current as any;
        if (!scrollRefCurrent) return;

        const getScrollElement = () => {
          if (scrollRefCurrent._component) {
            return scrollRefCurrent._component.querySelector?.('div[style*="overflow"]') ||
              scrollRefCurrent._component.querySelector?.('div[class*="scroll"]') ||
              scrollRefCurrent;
          }
          return null;
        };

        scrollElement = getScrollElement();
        if (!scrollElement) return;

        const handleWebScroll = () => {
          if (!scrollElement) return;

          const currentScrollX = scrollElement.scrollLeft;
          const currentMaxScrollX = scrollElement.scrollWidth - scrollElement.clientWidth;

          scrollXRef.current = currentScrollX;
          maxScrollXRef.current = currentMaxScrollX;
          viewportWidthRef.current = scrollElement.clientWidth;
          contentWidthRef.current = scrollElement.scrollWidth;
          updateArrows(currentScrollX, currentMaxScrollX);
        };

        scrollElement.addEventListener('scroll', handleWebScroll, { passive: true });
        const initTimeout = setTimeout(handleWebScroll, 100);

        cleanupFn = () => {
          clearTimeout(initTimeout);
          scrollElement?.removeEventListener('scroll', handleWebScroll);
        };
      } catch (error) {
        console.warn('Failed to set up horizontal scroll listener:', error);
      }
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      cleanupFn?.();
    };
  }, [updateArrows]);

  return {
    scrollRef,
    canScrollLeft,
    canScrollRight,
    leftArrowStyle,
    rightArrowStyle,
    handleWheel,
    handleScroll,
    handleScrollBeginDrag: handleScroll,
    handleScrollEndDrag: handleScroll,
    handleMomentumScrollEnd: handleScroll,
    handleLayout,
    handleContentSizeChange,
    scroll,
  };
}
