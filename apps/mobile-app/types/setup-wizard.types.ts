import type { SnapshotFrom } from 'xstate';

import type { setupWizardMachine } from '../hooks/setup-wizard-machine';
import type { createSetupWizardActor } from '../hooks/useSetup';
import type { PrivacyScope, SetupGoal, UserSetup } from './setup';

/** First-run setup for Contacts, in three steps: goals -> topics -> privacy (consent + PIN). */
export type SetupWizardStep = 'goals' | 'topics' | 'privacy';
export type SetupWizardError = 'load_failed' | 'save_failed';

/** Pure wizard state. It never sees the PIN: the pad talks to the server and reports only PIN_SET. */
export interface SetupWizardContext {
  setup: UserSetup | null;
  goals: SetupGoal[];
  topics: string[];
  privacyScope: PrivacyScope;
  consent: boolean;
  pinEnabled: boolean;
  /** Re-opened from settings by someone who already finished. Saving can never un-complete them. */
  revisiting: boolean;
  error: SetupWizardError | null;
}

export type SetupWizardEvent =
  | { type: 'RETRY' }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'TOGGLE_GOAL'; goal: SetupGoal }
  | { type: 'TOGGLE_TOPIC'; topic: string }
  | { type: 'SET_PRIVACY'; scope: PrivacyScope }
  | { type: 'SET_CONSENT'; accepted: boolean }
  | { type: 'PIN_SET' }
  | { type: 'FINISH' }
  | { type: 'REVISIT' };

export type SetupWizardSnapshot = SnapshotFrom<typeof setupWizardMachine>;

/** What a screen needs from the machine, reduced to one plain object per phase. */
export interface SetupWizardView {
  phase: 'loading' | 'loadFailed' | 'wizard' | 'finishing' | 'complete';
  step: SetupWizardStep | null;
  /** 1-based, for "Step 2 of 3". Null outside the wizard. */
  stepNumber: number | null;
  stepCount: number;
  canGoBack: boolean;
  canFinish: boolean;
  error: SetupWizardError | null;
}

export type SetupWizardActor = ReturnType<typeof createSetupWizardActor>;

/** One account's running wizard: actor plus its latest snapshot. */
export interface Running {
  owner: string;
  actor: SetupWizardActor;
  snapshot: SetupWizardSnapshot;
}

/** What `useSetup` hands a screen. Null view until a signed-in person is known. */
export interface UseSetup {
  /** Null until a signed-in person is known: guests never trigger a setup request. */
  view: SetupWizardView | null;
  context: SetupWizardContext | null;
  /** True while the wizard must be shown (first run, or the consent text moved on). */
  required: boolean;
  send: (event: SetupWizardEvent) => void;
}
