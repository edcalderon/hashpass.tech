import type { ReactNode } from 'react';

export interface RevealBadgeProps {
  /** Text shown once expanded; always the accessible name, even while collapsed. */
  label: string;
  /** Hue of the badge: tints the background and contour. */
  color: string;
  isDark?: boolean;
  /** Glyph shown in the collapsed circle and kept when expanded. */
  icon: ReactNode;
  /** Opaque colour of the surface the badge sits on, so the expanded pill hides what it covers. */
  surfaceColor: string;
  /** Colour of the expanded label. */
  textColor: string;
  testID?: string;
}
