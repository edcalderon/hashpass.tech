import type { AnimationLevel } from "../../../contexts/AnimationLevelContext";

export type MagicLinkSparkIconProps = {
  /** Foreground color inherited from the selected or unselected auth tab. */
  color: string;
  /** Starts the authored sparkle sequence only for the selected auth method. */
  isActive: boolean;
  /** Honors the app-wide motion preference. */
  animationLevel: AnimationLevel;
  size?: number;
};
