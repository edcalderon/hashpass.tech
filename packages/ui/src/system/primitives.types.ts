import type { ReactNode } from 'react';

export type SegmentedTab<T extends string = string> = {
  id: T;
  label: string;
  /** Optional unread/result count shown as a small badge. */
  count?: number;
  /** Optional trailing affordance, such as a disclosure chevron. */
  trailingIcon?: ReactNode;
};
