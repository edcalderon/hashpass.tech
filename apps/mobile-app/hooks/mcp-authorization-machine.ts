import { useEffect, useRef, useState } from 'react';
import { assign, createActor, setup, type ActorRefFrom, type SnapshotFrom } from 'xstate';

import type {
  McpAuthorizationContext,
  McpAuthorizationEvent,
  McpAuthorizationMachineInput,
  McpAuthorizationPhase,
  McpAuthorizationView,
} from '@/types/mcp-authorization-machine.types';

export const mcpAuthorizationMachine = setup({
  types: {
    context: {} as McpAuthorizationContext,
    input: {} as McpAuthorizationMachineInput,
    events: {} as McpAuthorizationEvent,
  },
  guards: {
    requestIsInvalid: ({ context }) => !context.request.isValid,
    requestIsExpired: ({ context }) => context.request.isExpired,
    isLoginFlow: ({ context }) => context.flow === 'login',
  },
}).createMachine({
  id: 'mcpAuthorization',
  context: ({ input }) => ({ ...input, error: null }),
  initial: 'checkingSession',
  states: {
    checkingSession: {
      always: [
        { guard: 'requestIsInvalid', target: 'invalid' },
        { guard: 'requestIsExpired', target: 'expired' },
      ],
      on: {
        SESSION_AUTHENTICATED: [
          { guard: 'isLoginFlow', target: 'authorizationRedirect' },
          { target: 'consentVerification' },
        ],
        SESSION_ANONYMOUS: { target: 'signInRequired' },
        SESSION_CHECK_FAILED: {
          target: 'sessionError',
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    signInRequired: {},
    authorizationRedirect: {},
    consentVerification: {
      on: {
        CONSENT_VERIFIED: { target: 'consentReady' },
        CONSENT_EXPIRED: { target: 'expired' },
        CONSENT_VERIFICATION_FAILED: {
          target: 'consentVerificationError',
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    consentReady: {
      on: {
        CONSENT_SUBMIT: { target: 'consentSubmitting' },
      },
    },
    consentSubmitting: {
      on: {
        CONSENT_COMPLETED: { target: 'completed' },
        CONSENT_SUBMISSION_FAILED: {
          target: 'consentSubmissionError',
          actions: assign({ error: ({ event }) => event.message }),
        },
      },
    },
    sessionError: {
      on: {
        RETRY: { target: 'checkingSession', actions: assign({ error: null }) },
      },
    },
    consentVerificationError: {
      on: {
        RETRY: { target: 'consentVerification', actions: assign({ error: null }) },
      },
    },
    consentSubmissionError: {
      on: {
        RETRY: { target: 'consentReady', actions: assign({ error: null }) },
      },
    },
    invalid: {},
    expired: {},
    completed: {},
  },
});

export const createMcpAuthorizationActor = (input: McpAuthorizationMachineInput) => {
  const actor = createActor(mcpAuthorizationMachine, { input });
  actor.start();
  return actor;
};

export const getMcpAuthorizationView = (
  snapshot: SnapshotFrom<typeof mcpAuthorizationMachine>,
): McpAuthorizationView => {
  const phase = snapshot.value as McpAuthorizationPhase;
  const error = phase === 'invalid'
    ? 'This authorization request is missing or invalid. Return to ChatGPT and start a new connection.'
    : phase === 'expired'
      ? 'This authorization request has expired. Return to ChatGPT and start a new connection.'
      : snapshot.context.error;

  return {
    phase,
    canRedirectToAuthorization: phase === 'authorizationRedirect',
    canSubmitConsent: phase === 'consentReady',
    canRetry: phase === 'sessionError'
      || phase === 'consentVerificationError'
      || phase === 'consentSubmissionError',
    isBusy: phase === 'checkingSession'
      || phase === 'authorizationRedirect'
      || phase === 'consentVerification'
      || phase === 'consentSubmitting',
    error,
  };
};

export const useMcpAuthorizationMachine = (input: McpAuthorizationMachineInput) => {
  const actorRef = useRef<ActorRefFrom<typeof mcpAuthorizationMachine> | null>(null);
  if (!actorRef.current) {
    actorRef.current = createMcpAuthorizationActor(input);
  }

  const actor = actorRef.current;
  const [snapshot, setSnapshot] = useState(() => actor.getSnapshot());

  useEffect(() => {
    const subscription = actor.subscribe(setSnapshot);
    setSnapshot(actor.getSnapshot());

    return () => {
      subscription.unsubscribe();
      actor.stop();
    };
  }, [actor]);

  return {
    actor,
    send: actor.send,
    snapshot,
    view: getMcpAuthorizationView(snapshot),
  };
};
