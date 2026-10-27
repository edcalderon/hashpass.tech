/**
 * Meeting request rules, mirrored from `public.meeting_request_duration` (V155).
 * The database derives the real length and enforces the coffee gate; these helpers only
 * drive what the UI previews, so keep them in step with the migration.
 *
 *   speed   Quick stand-up: 5 minutes, +5 per full 10 boost points, 30 minutes at most.
 *   coffee  Coffee break: 15, 30 or 45 minutes. Business and VIP passes only.
 */
import type { CoffeeDuration, MeetingKind } from './meeting-rules.types';

export type { CoffeeDuration, MeetingKind } from './meeting-rules.types';

export const SPEED_BASE_MINUTES = 5;
export const SPEED_MAX_MINUTES = 30;
/** Boost points that buy one extra 5-minute step of a stand-up. */
export const BOOST_POINTS_PER_STEP = 10;
export const STEP_MINUTES = 5;
export const COFFEE_DURATIONS = [15, 30, 45] as const satisfies readonly CoffeeDuration[];
export const COFFEE_PASS_TYPES = ['business', 'vip'] as const;

export function canBookCoffee(passType: string | null | undefined): boolean {
  return COFFEE_PASS_TYPES.includes(String(passType ?? '').toLowerCase() as (typeof COFFEE_PASS_TYPES)[number]);
}

export function meetingKind(value: unknown): MeetingKind {
  return value === 'coffee' ? 'coffee' : 'speed';
}

/** Minutes a request lasts, given its type, boost points and (coffee) chosen length. */
export function meetingDurationMinutes(kind: MeetingKind, boostPoints: number, coffeeMinutes?: number): number {
  if (kind === 'coffee') {
    const requested = Number.isFinite(coffeeMinutes) ? Math.floor(coffeeMinutes as number) : COFFEE_DURATIONS[0];
    return Math.min(45, Math.max(15, Math.floor(requested / 15) * 15));
  }
  const points = Number.isFinite(boostPoints) ? Math.max(0, Math.floor(boostPoints)) : 0;
  return Math.min(SPEED_MAX_MINUTES, SPEED_BASE_MINUTES + Math.floor(points / BOOST_POINTS_PER_STEP) * STEP_MINUTES);
}

/** Boost points at which a stand-up first reaches `minutes` (used for the bar marks). */
export function boostPointsForMinutes(minutes: number): number {
  return Math.max(0, Math.ceil((minutes - SPEED_BASE_MINUTES) / STEP_MINUTES)) * BOOST_POINTS_PER_STEP;
}

/** Translated name for a stored meeting type; legacy free-text types are shown as stored. */
export function meetingTypeLabel(type: string | null | undefined, translate: (key: string) => string): string {
  if (type === 'speed' || type === 'coffee') return translate(`meetingRequestModal.types.${type}.title`);
  return type ? String(type) : '';
}
