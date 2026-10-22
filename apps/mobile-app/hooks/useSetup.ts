import { useCallback, useEffect, useState } from 'react';
import { createActor, fromPromise, type Actor } from 'xstate';

import { fetchSetup, saveSetup } from '../lib/setup-client';
import {
  getSetupWizardView,
  setupWizardMachine,
  type SetupWizardContext,
  type SetupWizardEvent,
  type SetupWizardSnapshot,
  type SetupWizardView,
} from './setup-wizard-machine';

const machineWithApi = () => {
  // Draft saves are best-effort, but they must land in order and before the final save,
  // otherwise a slow "step 1" draft could overwrite what "finish" just wrote.
  let queue: Promise<unknown> = Promise.resolve();
  return setupWizardMachine.provide({
    actors: {
      loadSetup: fromPromise(() => fetchSetup()),
      finishSetup: fromPromise(async ({ input }) => {
        await queue.catch(() => undefined);
        return saveSetup(input.patch);
      }),
    },
    actions: {
      persistProgress: (_, params) => {
        queue = queue.catch(() => undefined).then(() => saveSetup(params.patch)).catch(() => undefined);
      },
    },
  });
};

export const createSetupWizardActor = () => createActor(machineWithApi());
type SetupWizardActor = Actor<ReturnType<typeof machineWithApi>>;

export interface UseSetup {
  /** Null until a signed-in person is known: guests never trigger a setup request. */
  view: SetupWizardView | null;
  context: SetupWizardContext | null;
  /** True while the wizard must be shown (first run, or the consent text moved on). */
  required: boolean;
  send: (event: SetupWizardEvent) => void;
}

interface Running { owner: string; actor: SetupWizardActor; snapshot: SetupWizardSnapshot }

/**
 * Runs the setup wizard machine for one account. Switching accounts stops the old actor,
 * so a late answer for the previous person can never be shown to the next one.
 */
export function useSetup(userId: string | null): UseSetup {
  const [running, setRunning] = useState<Running | null>(null);

  useEffect(() => {
    if (!userId) { setRunning(null); return undefined; }
    const actor = createSetupWizardActor();
    const subscription = actor.subscribe(snapshot => setRunning({ owner: userId, actor, snapshot }));
    actor.start();
    setRunning({ owner: userId, actor, snapshot: actor.getSnapshot() });
    return () => { subscription.unsubscribe(); actor.stop(); };
  }, [userId]);

  const current = running && running.owner === userId ? running : null;
  const send = useCallback((event: SetupWizardEvent) => current?.actor.send(event), [current]);
  const view = current ? getSetupWizardView(current.snapshot) : null;

  return {
    view,
    context: current?.snapshot.context ?? null,
    required: view?.phase === 'wizard' || view?.phase === 'finishing',
    send,
  };
}
