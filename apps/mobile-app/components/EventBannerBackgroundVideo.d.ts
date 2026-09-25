import type { ComponentType } from "react";

declare const EventBannerBackgroundVideo: ComponentType<{
  source: string;
  loadingLogo?: string;
  loadingLabel?: string;
  /** Use the packaged film for an event whose campaign media must work offline. */
  preferBundledSource?: boolean;
  /** Stops offscreen and reduced-motion media before it begins decoding. */
  playbackEnabled?: boolean;
}>;

export default EventBannerBackgroundVideo;
