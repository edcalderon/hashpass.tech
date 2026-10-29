import type { PropsWithChildren, ReactNode } from 'react';
import type { PressableProps } from 'react-native';

export type SegmentedTab<T extends string = string> = {
  id: T;
  label: string;
  /** Optional unread/result count shown as a small badge. */
  count?: number;
  /** Optional trailing affordance, such as a disclosure chevron. */
  trailingIcon?: ReactNode;
};

/**
 * Optional colour override for a product that keeps the shared geometry but has
 * its own brand colour (for example the LUKAS landing). Every fill pairs with an
 * `onFill` that must reach WCAG AA against it.
 */
export type ControlSkin = {
  fill: string;
  onFill: string;
  accent: string;
  soft: string;
  border: string;
};

export type BadgeProps = PropsWithChildren<
  { mode?: 'light' | 'dark' } & {
    tone?: "accent" | "neutral" | "onMedia";
    radius?: number;
    markerColor?: string;
    leadingIcon?: ReactNode;
    /** Trailing affordance, e.g. a check or an info glyph. */
    trailingIcon?: ReactNode;
    /**
     * Hue for a categorical badge (session type, status): a soft tint of the colour with a
     * matching contour. The label keeps the neutral text colour so any hue stays legible.
     */
    tint?: string;
    compact?: boolean;
    /**
     * Collapses to an icon-only circle (needs `leadingIcon`) that opens into its label
     * (`children`, a string) on hover or keyboard focus on web and on tap on native.
     */
    revealLabel?: boolean;
    /** Opaque colour behind a revealing badge so the opened pill hides what it covers. */
    surfaceColor?: string;
    /** Overrides the system reduced-motion preference, e.g. with the app's own setting. */
    motionAllowed?: boolean;
    onPress?: PressableProps["onPress"];
    accessibilityLabel?: string;
    /** Applied to the rendered badge only, so lookups by testID match once. */
    badgeTestID?: string;
  }
>;
