const CAROUSEL_FOOTER_STACK_BREAKPOINT = 1100;

/** Keep carousel actions and pagination reachable on medium-width layouts. */
export function shouldStackCarouselFooter(
  isMobile: boolean,
  screenWidth: number,
  platformOS: string,
) {
  return (
    isMobile ||
    (platformOS === "web" && screenWidth < CAROUSEL_FOOTER_STACK_BREAKPOINT)
  );
}

/**
 * Return a small window of pagination dots centred around the active card.
 * This prevents carousel controls from widening as event counts grow.
 */
export function getVisibleCarouselDotIndices(
  count: number,
  activeIndex: number,
  maximumVisible = 5,
): number[] {
  if (count <= 0) return [];
  const visibleCount = Math.min(count, Math.max(1, maximumVisible));
  const active = Math.min(Math.max(0, activeIndex), count - 1);
  const start = Math.min(
    Math.max(0, active - Math.floor(visibleCount / 2)),
    count - visibleCount,
  );
  return Array.from({ length: visibleCount }, (_, index) => start + index);
}
