import { assign, fromPromise, setup } from 'xstate';

import { MAX_CONTACT_TOPICS } from '../lib/contacts';
import { CURRENT_CONSENT_VERSION, needsSetup, toggleSetupGoal } from '../lib/setup';
import type { SetupPatch, UserSetup } from '../types/setup';
import type {
  SetupWizardContext,
  SetupWizardError,
  SetupWizardEvent,
  SetupWizardSnapshot,
  SetupWizardStep,
  SetupWizardView,
} from '../types/setup-wizard.types';

export type {
  SetupWizardContext,
  SetupWizardError,
  SetupWizardEvent,
  SetupWizardSnapshot,
  SetupWizardStep,
  SetupWizardView,
};

/**
 * First-run setup for Contacts, in three steps:
 *   goals -> topics -> privacy (consent + PIN)
 *
 * Pure state: it never sees the PIN. The PIN pad talks to the server and reports only
 * PIN_SET, so a PIN cannot end up in context, snapshots, logs or devtools.
 *
 * Loading and the final save are injected (`machine.provide({ actors })`), as is the
 * best-effort draft save (`persistProgress`), so the same machine runs in the app,
 * in Storybook and in plain unit tests.
 */
export const SETUP_WIZARD_STEPS: readonly SetupWizardStep[] = ['goals', 'topics', 'privacy'];

const initialContext = (): SetupWizardContext => ({
  setup: null,
  goals: [],
  topics: [],
  privacyScope: 'private',
  consent: false,
  pinEnabled: false,
  revisiting: false,
  error: null,
});

const stepIndex = (step: SetupWizardStep) => SETUP_WIZARD_STEPS.indexOf(step);

/** Fill the working copy from what the server knows. Private stays the default until the person says otherwise. */
function fromSetup(setup: UserSetup): Omit<SetupWizardContext, 'revisiting' | 'error'> {
  return {
    setup,
    goals: [...setup.goals],
    topics: [...setup.topics],
    privacyScope: setup.privacyScope,
    consent: (setup.consentVersion ?? 0) >= CURRENT_CONSENT_VERSION,
    pinEnabled: setup.pin.enabled,
  };
}

/** Where a person resumes: their saved step, or privacy when only the consent text changed. */
export function resumeStep(setup: UserSetup): SetupWizardStep {
  if (setup.status === 'complete') return 'privacy';
  return SETUP_WIZARD_STEPS[Math.min(Math.max(setup.step, 0), SETUP_WIZARD_STEPS.length - 1)] ?? 'goals';
}

/** What the final save sends: everything the wizard collected, plus the consent version they accepted. */
export const finishPatch = (context: SetupWizardContext): SetupPatch => ({
  goals: context.goals,
  topics: context.topics,
  privacyScope: context.privacyScope,
  consentVersion: CURRENT_CONSENT_VERSION,
  step: SETUP_WIZARD_STEPS.length,
  complete: true,
});

export const setupWizardMachine = setup({
  types: {
    context: {} as SetupWizardContext,
    events: {} as SetupWizardEvent,
  },
  actors: {
    loadSetup: fromPromise<UserSetup>(async () => {
      throw new Error('loadSetup actor not provided');
    }),
    finishSetup: fromPromise<UserSetup, { patch: SetupPatch }>(async () => {
      throw new Error('finishSetup actor not provided');
    }),
  },
  actions: {
    // Best-effort: a failed draft save must never block moving through the wizard.
    persistProgress: (_, _params: { patch: SetupPatch }) => {},
    toggleGoal: assign(({ context, event }) =>
      event.type === 'TOGGLE_GOAL' ? { goals: toggleSetupGoal(context.goals, event.goal) } : {}),
    toggleTopic: assign(({ context, event }) => {
      if (event.type !== 'TOGGLE_TOPIC') return {};
      const topics = context.topics.includes(event.topic)
        ? context.topics.filter(topic => topic !== event.topic)
        : context.topics.length < MAX_CONTACT_TOPICS ? [...context.topics, event.topic] : context.topics;
      return { topics };
    }),
    setPrivacy: assign(({ event }) => (event.type === 'SET_PRIVACY' ? { privacyScope: event.scope } : {})),
    setConsent: assign(({ event }) => (event.type === 'SET_CONSENT' ? { consent: event.accepted } : {})),
    markPinSet: assign({ pinEnabled: true }),
    clearError: assign({ error: null }),
    startRevisit: assign({ revisiting: true, error: null }),
  },
  guards: {
    needsWizard: ({ context }) => needsSetup(context.setup),
    resumesAtGoals: ({ context }) => context.setup !== null && resumeStep(context.setup) === 'goals',
    resumesAtTopics: ({ context }) => context.setup !== null && resumeStep(context.setup) === 'topics',
    canFinish: ({ context }) => context.consent && context.pinEnabled,
  },
}).createMachine({
  id: 'setupWizard',
  context: initialContext,
  initial: 'loading',
  states: {
    loading: {
      invoke: {
        src: 'loadSetup',
        onDone: {
          target: 'routing',
          actions: assign(({ event }) => ({ ...fromSetup(event.output), error: null })),
        },
        onError: { target: 'loadFailed', actions: assign({ error: 'load_failed' }) },
      },
    },
    loadFailed: { on: { RETRY: { target: 'loading', actions: 'clearError' } } },
    // Transient: pick the first screen from what loading found.
    routing: {
      always: [
        { guard: 'needsWizard', target: 'wizard' },
        { target: 'complete' },
      ],
    },
    wizard: {
      initial: 'entry',
      states: {
        entry: {
          always: [
            { guard: 'resumesAtGoals', target: 'goals' },
            { guard: 'resumesAtTopics', target: 'topics' },
            { target: 'privacy' },
          ],
        },
        goals: {
          on: {
            TOGGLE_GOAL: { actions: 'toggleGoal' },
            NEXT: {
              target: 'topics',
              actions: {
                type: 'persistProgress',
                params: ({ context }) => ({ patch: { goals: context.goals, step: stepIndex('topics') } }),
              },
            },
          },
        },
        topics: {
          on: {
            TOGGLE_TOPIC: { actions: 'toggleTopic' },
            BACK: 'goals',
            NEXT: {
              target: 'privacy',
              actions: {
                type: 'persistProgress',
                params: ({ context }) => ({ patch: { topics: context.topics, step: stepIndex('privacy') } }),
              },
            },
          },
        },
        privacy: {
          on: {
            SET_PRIVACY: { actions: 'setPrivacy' },
            SET_CONSENT: { actions: 'setConsent' },
            PIN_SET: { actions: 'markPinSet' },
            BACK: 'topics',
            FINISH: { guard: 'canFinish', target: '#setupWizard.finishing' },
          },
        },
      },
    },
    finishing: {
      entry: 'clearError',
      invoke: {
        src: 'finishSetup',
        input: ({ context }) => ({ patch: finishPatch(context) }),
        onDone: {
          target: 'complete',
          actions: assign(({ event }) => ({ ...fromSetup(event.output), revisiting: false, error: null })),
        },
        // Back on the last step with everything still filled in, so retrying is one tap.
        onError: { target: 'wizard.privacy', actions: assign({ error: 'save_failed' }) },
      },
    },
    complete: { on: { REVISIT: { target: 'wizard.goals', actions: 'startRevisit' } } },
  },
});

export function getSetupWizardView(snapshot: SetupWizardSnapshot): SetupWizardView {
  const value = snapshot.value;
  const step = typeof value === 'object' && 'wizard' in value && value.wizard !== 'entry'
    ? (value.wizard as SetupWizardStep) : null;
  const phase = step ? 'wizard'
    : value === 'loadFailed' ? 'loadFailed'
    : value === 'finishing' ? 'finishing'
    : value === 'complete' ? 'complete'
    : 'loading';
  return {
    phase,
    step,
    stepNumber: step ? stepIndex(step) + 1 : null,
    stepCount: SETUP_WIZARD_STEPS.length,
    canGoBack: step === 'topics' || step === 'privacy',
    canFinish: step === 'privacy' && snapshot.context.consent && snapshot.context.pinEnabled,
    error: snapshot.context.error,
  };
}
