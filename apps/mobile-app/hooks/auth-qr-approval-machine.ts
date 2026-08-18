import { assign, createActor, createMachine, fromPromise, type SnapshotFrom } from 'xstate';
import { HashpassError } from '@hashpass-tech/sdk';

export type SessionStatus = 'checking' | 'ready' | 'signed_out';
type Decision = 'approve' | 'deny';

export const SIGN_IN_COUNTDOWN_SECONDS = 5;

export type AuthQrApprovalMachineInput = {
  challengeId: string | undefined;
  respondToLogin: (challengeId: string, decision: Decision) => Promise<unknown>;
  onApproved: () => void;
  onDenied: () => void;
  onCancel: () => void;
  onSignInRequired: () => void;
  onInvalidAction: () => void;
};

type Context = AuthQrApprovalMachineInput & {
  errorMessage: string | null;
  secondsLeft: number;
  pendingDecision: Decision | null;
};

export type AuthQrApprovalMachineEvent =
  | { type: 'SESSION_STATUS'; status: SessionStatus }
  | { type: 'APPROVE' }
  | { type: 'DENY' }
  | { type: 'CANCEL' }
  | { type: 'SIGN_IN_NOW' }
  | { type: 'INVALID_ACTION' }
  | { type: 'RETRY' }
  | { type: 'DONE' }
  | { type: 'TICK' };

const isUnauthorized = (error: unknown): boolean =>
  error instanceof HashpassError && error.code === 'unauthorized';

// Every place a HASHPASS Auth login gets approved under the app's own
// session -- scanning the QR (app/(shared)/dashboard/auth-qr-approve.tsx)
// and opening the connect link directly from a desktop browser
// (app/auth/connect/index.tsx) -- drives the exact same UI
// (AuthQrApprovalCard) through this one machine, so the session gate,
// countdown, and respondToLogin() outcomes can't drift out of sync between
// the two entry points. Mirrors the createMachine/createActor shape of
// hooks/auth-session-machine.ts (this repo's other XState usage) -- no
// @xstate/react present, so consumers subscribe manually the same way
// hooks/useAuth.ts already does for that machine.
export const authQrApprovalMachine = createMachine(
  {
    id: 'authQrApproval',
    types: {} as {
      context: Context;
      events: AuthQrApprovalMachineEvent;
      input: AuthQrApprovalMachineInput;
    },
    context: ({ input }) => ({
      ...input,
      errorMessage: null,
      secondsLeft: SIGN_IN_COUNTDOWN_SECONDS,
      pendingDecision: null,
    }),
    initial: 'checkingSession',
    states: {
      checkingSession: {
        on: {
          SESSION_STATUS: [
            { guard: 'statusSignedOut', target: 'signedOut' },
            { guard: 'statusReadyWithChallenge', target: 'idle' },
            { guard: 'statusReadyWithoutChallenge', target: 'invalidChallenge' },
          ],
        },
      },
      signedOut: {
        entry: assign({ secondsLeft: SIGN_IN_COUNTDOWN_SECONDS }),
        on: {
          TICK: [
            { guard: 'countdownExpired', actions: 'requestSignIn' },
            { actions: assign({ secondsLeft: ({ context }) => context.secondsLeft - 1 }) },
          ],
          SIGN_IN_NOW: { actions: 'requestSignIn' },
          SESSION_STATUS: [
            { guard: 'statusReadyWithChallenge', target: 'idle' },
            { guard: 'statusReadyWithoutChallenge', target: 'invalidChallenge' },
          ],
        },
      },
      invalidChallenge: {
        on: {
          INVALID_ACTION: { actions: 'callOnInvalidAction' },
        },
      },
      idle: {
        on: {
          APPROVE: { target: 'submitting', actions: assign({ pendingDecision: 'approve' }) },
          DENY: { target: 'submitting', actions: assign({ pendingDecision: 'deny' }) },
          CANCEL: { actions: 'callOnCancel' },
        },
      },
      submitting: {
        invoke: {
          id: 'respondToLogin',
          src: 'respondToLoginActor',
          input: ({ context }) => ({
            challengeId: context.challengeId,
            decision: context.pendingDecision,
            respondToLogin: context.respondToLogin,
          }),
          onDone: [
            { guard: 'wasApproveDecision', target: 'approved' },
            { target: 'denied' },
          ],
          onError: [
            { guard: 'errorWasUnauthorized', target: 'signedOut' },
            { actions: 'setErrorMessage', target: 'error' },
          ],
        },
      },
      approved: {
        on: { DONE: { actions: 'callOnApproved' } },
      },
      denied: {
        on: { DONE: { actions: 'callOnDenied' } },
      },
      error: {
        on: {
          RETRY: { target: 'idle', actions: assign({ errorMessage: null }) },
          CANCEL: { actions: 'callOnCancel' },
        },
      },
    },
  },
  {
    actors: {
      respondToLoginActor: fromPromise(
        async ({
          input,
        }: {
          input: { challengeId: string | undefined; decision: Decision | null; respondToLogin: Context['respondToLogin'] };
        }) => {
          if (!input.challengeId || !input.decision) {
            throw new Error('Missing challengeId or decision');
          }
          return input.respondToLogin(input.challengeId, input.decision);
        }
      ),
    },
    actions: {
      requestSignIn: ({ context }) => context.onSignInRequired(),
      // Best-effort: without this, cancelling here (leaving without a
      // decision) is invisible to the browser side -- the challenge stays
      // 'pending' server-side, so waitForLogin()'s poll never sees a
      // terminal status and the browser just keeps waiting until the
      // challenge's own server-side expiry, minutes later, with no
      // indication anything happened. Treating cancel as an implicit deny
      // lets the browser's existing 'denied' handling (see
      // SignInModal.tsx's waitForLogin catch) pick it up on the very next
      // poll instead. Fire-and-forget: onCancel() below must still run even
      // if this fails (already expired/handled, network error, etc.), and
      // the caller isn't waiting on this screen's own network round trip.
      callOnCancel: ({ context }) => {
        if (context.challengeId) {
          context.respondToLogin(context.challengeId, 'deny').catch(() => {});
        }
        context.onCancel();
      },
      callOnInvalidAction: ({ context }) => context.onInvalidAction(),
      callOnApproved: ({ context }) => context.onApproved(),
      callOnDenied: ({ context }) => context.onDenied(),
      setErrorMessage: assign({
        errorMessage: ({ event }) => {
          const error = (event as { error?: unknown }).error;
          return error instanceof HashpassError ? error.message : 'Something went wrong. Please try again.';
        },
      }),
    },
    guards: {
      statusSignedOut: ({ event }) => event.type === 'SESSION_STATUS' && event.status === 'signed_out',
      statusReadyWithChallenge: ({ context, event }) =>
        event.type === 'SESSION_STATUS' && event.status === 'ready' && Boolean(context.challengeId),
      statusReadyWithoutChallenge: ({ context, event }) =>
        event.type === 'SESSION_STATUS' && event.status === 'ready' && !context.challengeId,
      countdownExpired: ({ context }) => context.secondsLeft <= 1,
      wasApproveDecision: ({ context }) => context.pendingDecision === 'approve',
      errorWasUnauthorized: ({ event }) => isUnauthorized((event as { error?: unknown }).error),
    },
  }
);

export type AuthQrApprovalMachineSnapshot = SnapshotFrom<typeof authQrApprovalMachine>;

export const createAuthQrApprovalActor = (input: AuthQrApprovalMachineInput) =>
  createActor(authQrApprovalMachine, { input });
