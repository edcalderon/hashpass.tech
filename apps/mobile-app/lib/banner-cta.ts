import type { EventBannerCtaPosition } from "@hashpass/types";

export const DEFAULT_EVENT_BANNER_CTA_POSITION: EventBannerCtaPosition =
  "bottom-right";

export const resolveEventBannerCtaPosition = (
  position?: EventBannerCtaPosition,
): EventBannerCtaPosition => position || DEFAULT_EVENT_BANNER_CTA_POSITION;

/**
 * Shared banner CTA placement. CTAs are anchored to the banner itself, not
 * its text block, so every default CTA stays in a predictable corner.
 */
export const getEventBannerCtaLayout = (
  position?: EventBannerCtaPosition,
  {
    edge = 20,
    bottom = 20,
    top = 20,
  }: { edge?: number; bottom?: number; top?: number } = {},
) => {
  switch (resolveEventBannerCtaPosition(position)) {
    case "bottom-left":
      return { position: "absolute" as const, left: edge, bottom };
    case "top-right":
      return { position: "absolute" as const, right: edge, top };
    case "top-left":
      return { position: "absolute" as const, left: edge, top };
    case "bottom-right":
    default:
      return { position: "absolute" as const, right: edge, bottom };
  }
};
