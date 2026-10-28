import type { ReactNode } from 'react';

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
