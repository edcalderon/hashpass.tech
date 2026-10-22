import { useCallback, useEffect, useState } from 'react';
import { createActor, fromPromise } from 'xstate';

import { fetchSetup, saveSetup } from '../lib/setup-client';
import { getSetupWizardView, setupWizardMachine } from './setup-wizard-machine';
import type { Running, SetupWizardActor, UseSetup } from '../types/setup-wizard.types';
import type {
  SetupWizardContext,
  SetupWizardEvent,
  SetupWizardSnapshot,
  SetupWizardView,
} from '../types/setup-wizard.types';

export type { Running, SetupWizardActor, UseSetup };
export type { SetupWizardContext, SetupWizardEvent, SetupWizardSnapshot, SetupWizardView };

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
