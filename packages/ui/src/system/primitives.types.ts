export type SegmentedTab<T extends string = string> = {
  id: T;
  label: string;
  /** Optional unread/result count shown as a small badge. */
  count?: number;
};
