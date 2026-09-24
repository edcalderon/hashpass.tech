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
