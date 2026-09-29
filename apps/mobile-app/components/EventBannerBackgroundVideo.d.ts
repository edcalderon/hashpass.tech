import type { ComponentType } from "react";

declare const EventBannerBackgroundVideo: ComponentType<{
  source: string;
  loadingLogo?: string;
  loadingLabel?: string;
  /** Stops offscreen and reduced-motion media before it begins decoding. */
  playbackEnabled?: boolean;
  /** Suppress the loader when the caller already renders a full poster. */
  showLoadingIndicator?: boolean;
  contentFit?: "cover" | "contain";
  focalPosition?: string;
}>;

export default EventBannerBackgroundVideo;
