import { createActor, fromPromise } from 'xstate';

import {
  SETUP_WIZARD_STEPS,
  finishPatch,
  getSetupWizardView,
  resumeStep,
  setupWizardMachine,
  type SetupWizardEvent,
} from '../../hooks/setup-wizard-machine';
import { CURRENT_CONSENT_VERSION } from '../../lib/setup';
import type { SetupPatch, UserSetup } from '../../types/setup';

const makeSetup = (overrides: Partial<UserSetup> = {}): UserSetup => ({
  status: 'not_started',
  step: 0,
  goals: [],
  topics: [],
  privacyScope: 'private',
  consentVersion: null,
  completedAt: null,
  pin: { enabled: false, lockedUntil: null, remainingAttempts: null },
  ...overrides,
});

const completeSetup = (overrides: Partial<UserSetup> = {}) =>
  makeSetup({
    status: 'complete',
    step: 3,
    goals: ['learn'],
    topics: ['AI'],
    consentVersion: CURRENT_CONSENT_VERSION,
    completedAt: '2026-10-01T00:00:00.000Z',
    pin: { enabled: true, lockedUntil: null, remainingAttempts: 5 },
    ...overrides,
  });

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function start(options: {
  load?: () => Promise<UserSetup>;
  finish?: (patch: SetupPatch) => Promise<UserSetup>;
  saved?: SetupPatch[];
}) {
  const saved = options.saved ?? [];
  const machine = setupWizardMachine.provide({
    actors: {
      loadSetup: fromPromise(async () => (options.load ?? (async () => makeSetup()))()),
      finishSetup: fromPromise(async ({ input }) => (options.finish ?? (async () => completeSetup()))(input.patch)),
    },
    actions: {
      persistProgress: (_, params) => { saved.push(params.patch); },
    },
  });
  const actor = createActor(machine).start();
  const send = (event: SetupWizardEvent) => actor.send(event);
  return { actor, send, saved, snapshot: () => actor.getSnapshot(), view: () => getSetupWizardView(actor.getSnapshot()) };
}

describe('setupWizardMachine', () => {
  it('loads, then opens the first step for someone who has never set up', async () => {
    const wizard = start({});
    expect(wizard.view().phase).toBe('loading');
    await flush();
    expect(wizard.view()).toMatchObject({ phase: 'wizard', step: 'goals', stepNumber: 1, stepCount: 3, canGoBack: false });
    expect(wizard.snapshot().context.privacyScope).toBe('private');
  });

  it('skips the wizard entirely for someone who finished with the current consent', async () => {
    const wizard = start({ load: async () => completeSetup() });
    await flush();
    expect(wizard.view().phase).toBe('complete');
    expect(wizard.snapshot().context).toMatchObject({ goals: ['learn'], topics: ['AI'], pinEnabled: true, consent: true });
  });

  it('asks again, at the privacy step, when the consent text has moved on', async () => {
    const wizard = start({ load: async () => completeSetup({ consentVersion: CURRENT_CONSENT_VERSION - 1 }) });
    await flush();
    expect(wizard.view()).toMatchObject({ phase: 'wizard', step: 'privacy' });
    expect(wizard.snapshot().context.consent).toBe(false);
    // The old answers are kept, so only the new consent is asked for.
    expect(wizard.snapshot().context.goals).toEqual(['learn']);
  });

  it.each([
    [0, 'goals'], [1, 'topics'], [2, 'privacy'], [3, 'privacy'],
  ] as const)('resumes an in-progress setup saved at step %i on %s', async (step, expected) => {
    const wizard = start({ load: async () => makeSetup({ status: 'in_progress', step }) });
    await flush();
    expect(wizard.view().step).toBe(expected);
    expect(resumeStep(makeSetup({ status: 'in_progress', step }))).toBe(expected);
  });

  it('retries a failed load without losing the screen', async () => {
    let attempts = 0;
    const wizard = start({ load: async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); return makeSetup(); } });
    await flush();
    expect(wizard.view()).toMatchObject({ phase: 'loadFailed', error: 'load_failed' });
    wizard.send({ type: 'RETRY' });
    await flush();
    expect(wizard.view()).toMatchObject({ phase: 'wizard', step: 'goals', error: null });
  });

  it('caps goals at three and lets a chosen one be removed', async () => {
    const wizard = start({});
    await flush();
    for (const goal of ['hire', 'learn', 'friends', 'investors'] as const) wizard.send({ type: 'TOGGLE_GOAL', goal });
    expect(wizard.snapshot().context.goals).toEqual(['hire', 'learn', 'friends']);
    wizard.send({ type: 'TOGGLE_GOAL', goal: 'learn' });
    wizard.send({ type: 'TOGGLE_GOAL', goal: 'investors' });
    expect(wizard.snapshot().context.goals).toEqual(['hire', 'friends', 'investors']);
  });

  it('caps topics at five', async () => {
    const wizard = start({});
    await flush();
    wizard.send({ type: 'NEXT' });
    for (const topic of ['AI', 'Web3', 'Design', 'Startups', 'Payments', 'DeFi']) wizard.send({ type: 'TOGGLE_TOPIC', topic });
    expect(wizard.snapshot().context.topics).toEqual(['AI', 'Web3', 'Design', 'Startups', 'Payments']);
  });

  it('saves a draft on each step so closing the app resumes where they left off', async () => {
    const wizard = start({});
    await flush();
    wizard.send({ type: 'TOGGLE_GOAL', goal: 'cofounders' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'TOGGLE_TOPIC', topic: 'AI' });
    wizard.send({ type: 'NEXT' });
    expect(wizard.saved).toEqual([
      { goals: ['cofounders'], step: 1 },
      { topics: ['AI'], step: 2 },
    ]);
    expect(wizard.view().step).toBe('privacy');
  });

  it('moves back without discarding choices', async () => {
    const wizard = start({});
    await flush();
    wizard.send({ type: 'TOGGLE_GOAL', goal: 'hire' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'TOGGLE_TOPIC', topic: 'AI' });
    wizard.send({ type: 'NEXT' });
    expect(wizard.view().canGoBack).toBe(true);
    wizard.send({ type: 'BACK' });
    wizard.send({ type: 'BACK' });
    expect(wizard.view().step).toBe('goals');
    expect(wizard.snapshot().context).toMatchObject({ goals: ['hire'], topics: ['AI'] });
    wizard.send({ type: 'BACK' });
    expect(wizard.view().step).toBe('goals');
  });

  it('will not finish without consent and a PIN, whichever comes first', async () => {
    const finish = jest.fn(async () => completeSetup());
    const wizard = start({ finish });
    await flush();
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'NEXT' });

    wizard.send({ type: 'FINISH' });
    expect(wizard.view()).toMatchObject({ step: 'privacy', canFinish: false });

    wizard.send({ type: 'SET_CONSENT', accepted: true });
    wizard.send({ type: 'FINISH' });
    expect(wizard.view()).toMatchObject({ step: 'privacy', canFinish: false });

    wizard.send({ type: 'SET_CONSENT', accepted: false });
    wizard.send({ type: 'PIN_SET' });
    wizard.send({ type: 'FINISH' });
    expect(wizard.view()).toMatchObject({ step: 'privacy', canFinish: false });
    expect(finish).not.toHaveBeenCalled();

    wizard.send({ type: 'SET_CONSENT', accepted: true });
    expect(wizard.view().canFinish).toBe(true);
  });

  it('finishes with everything collected, the current consent version and the chosen scope', async () => {
    const finish = jest.fn(async (_patch: SetupPatch) => completeSetup({ privacyScope: 'public' }));
    const wizard = start({ finish });
    await flush();
    wizard.send({ type: 'TOGGLE_GOAL', goal: 'learn' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'TOGGLE_TOPIC', topic: 'Web3' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'SET_PRIVACY', scope: 'public' });
    wizard.send({ type: 'SET_CONSENT', accepted: true });
    wizard.send({ type: 'PIN_SET' });
    wizard.send({ type: 'FINISH' });
    expect(wizard.view().phase).toBe('finishing');
    await flush();

    expect(finish).toHaveBeenCalledWith({
      goals: ['learn'],
      topics: ['Web3'],
      privacyScope: 'public',
      consentVersion: CURRENT_CONSENT_VERSION,
      step: SETUP_WIZARD_STEPS.length,
      complete: true,
    });
    expect(wizard.view().phase).toBe('complete');
    expect(wizard.snapshot().context.privacyScope).toBe('public');
  });

  it('defaults to private: finishing without touching the scope shares nothing', async () => {
    const finish = jest.fn(async (_patch: SetupPatch) => completeSetup());
    const wizard = start({ finish });
    await flush();
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'SET_CONSENT', accepted: true });
    wizard.send({ type: 'PIN_SET' });
    wizard.send({ type: 'FINISH' });
    await flush();
    expect(finish.mock.calls[0]?.[0]).toMatchObject({ privacyScope: 'private' });
  });

  it('returns to the last step with every answer intact when the save fails, then succeeds on retry', async () => {
    let attempts = 0;
    const wizard = start({ finish: async () => { attempts += 1; if (attempts === 1) throw new Error('503'); return completeSetup(); } });
    await flush();
    wizard.send({ type: 'TOGGLE_GOAL', goal: 'hire' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'SET_CONSENT', accepted: true });
    wizard.send({ type: 'PIN_SET' });
    wizard.send({ type: 'FINISH' });
    await flush();

    expect(wizard.view()).toMatchObject({ phase: 'wizard', step: 'privacy', canFinish: true, error: 'save_failed' });
    expect(wizard.snapshot().context.goals).toEqual(['hire']);

    wizard.send({ type: 'FINISH' });
    expect(wizard.view().error).toBeNull();
    await flush();
    expect(wizard.view().phase).toBe('complete');
  });

  it('reopens for someone who is done, keeping them complete and their PIN', async () => {
    const wizard = start({ load: async () => completeSetup() });
    await flush();
    wizard.send({ type: 'REVISIT' });
    expect(wizard.view()).toMatchObject({ phase: 'wizard', step: 'goals' });
    expect(wizard.snapshot().context.revisiting).toBe(true);
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'NEXT' });
    // Consent and the PIN carry over, so there is nothing to redo.
    expect(wizard.view().canFinish).toBe(true);
  });

  it('never holds a PIN: no event carries one and the context has no field for it', async () => {
    const wizard = start({});
    await flush();
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'NEXT' });
    wizard.send({ type: 'PIN_SET' });
    // A hostile or buggy caller attaching a PIN to an event must not land it in state.
    (wizard.send as (event: unknown) => void)({ type: 'PIN_SET', pin: '1234' });
    expect(JSON.stringify(wizard.snapshot().context)).not.toMatch(/1234|"pin":"/);
    expect(Object.keys(wizard.snapshot().context).sort()).toEqual(
      ['consent', 'error', 'goals', 'pinEnabled', 'privacyScope', 'revisiting', 'setup', 'topics'],
    );
  });

  it('builds the final patch from context alone', () => {
    expect(finishPatch({
      setup: null, goals: ['hire'], topics: ['AI'], privacyScope: 'public',
      consent: true, pinEnabled: true, revisiting: false, error: null,
    })).toEqual({
      goals: ['hire'], topics: ['AI'], privacyScope: 'public',
      consentVersion: CURRENT_CONSENT_VERSION, step: 3, complete: true,
    });
  });
});
