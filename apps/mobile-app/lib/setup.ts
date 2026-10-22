import type { SetupGoal, UserSetup } from '../types/setup';

export const PIN_LENGTH = 4;

export const SETUP_GOALS = ['hire', 'get_hired', 'cofounders', 'learn', 'investors', 'friends'] as const satisfies readonly SetupGoal[];
export const MAX_SETUP_GOALS = 3;
/** Bump when the privacy/consent copy changes materially; everyone below it is asked again. */
export const CURRENT_CONSENT_VERSION = 1;

export const toggleSetupGoal = (goals: SetupGoal[], goal: SetupGoal): SetupGoal[] =>
  goals.includes(goal) ? goals.filter(value => value !== goal)
    : goals.length < MAX_SETUP_GOALS ? [...goals, goal] : goals;

/** True when the person must go through (or re-confirm) setup before Contacts shares anything. */
export function needsSetup(setup: UserSetup | null | undefined): boolean {
  if (!setup) return false;
  return setup.status !== 'complete' || (setup.consentVersion ?? 0) < CURRENT_CONSENT_VERSION;
}
