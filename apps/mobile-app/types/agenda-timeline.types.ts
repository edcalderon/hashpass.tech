import type { ReactNode } from 'react';

/** Absolute start/end of a session, in epoch milliseconds. */
export interface AgendaSessionWindow {
  start: number;
  end: number;
}

/** Where the "now" line sits relative to a day's chronologically ordered sessions. */
export interface AgendaNowPlacement {
  /** Index of the session the line is drawn against. */
  index: number;
  /** `before`: in the gap above the session; `within`: across it; `after`: below the last session. */
  mode: 'before' | 'within' | 'after';
  /** 0-1 progress through the session, set for `within`. */
  fraction?: number;
}

export interface AgendaTimeSlotProps {
  /** Start time label (e.g. "8:00 AM"); omitted when the previous session starts at the same time. */
  startLabel?: string;
  /** End time label shown under the start. */
  endLabel?: string;
  /** Hue of the session type, used for the rail marker. */
  color: string;
  isDark?: boolean;
  /** Current-time line drawn against this slot. */
  nowLine?: { mode: AgendaNowPlacement['mode']; fraction?: number; label: string } | null;
  testID?: string;
  children: ReactNode;
}
