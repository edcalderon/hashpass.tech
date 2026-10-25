import { assign, createActor, setup, type SnapshotFrom } from 'xstate';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  QrCameraContext,
  QrCameraMachineEvent,
  QrCameraStatus,
} from '@/types/qr-camera.types';

/**
 * Owns the camera session lifecycle independently from the QR payload flow.
 *
 * Permission prompts, scanner startup and modal cleanup are asynchronous and
 * can finish out of order. Keeping these transitions explicit means late
 * callbacks after CLOSE are ignored instead of reviving a stopped camera.
 */
export const qrCameraMachine = setup({
  types: {
    context: {} as QrCameraContext,
    events: {} as QrCameraMachineEvent,
  },
  actions: {
    clearError: assign({ error: null, canAskAgain: true }),
    setError: assign({
      error: ({ event }) => event.type === 'ERROR' ? event.message : null,
    }),
    setPermissionMessage: assign({
      error: ({ event }) => event.type === 'PERMISSION_REQUIRED'
        ? event.message ?? 'Camera permission is required.'
        : 'Camera permission is required.',
      canAskAgain: ({ event }) => event.type === 'PERMISSION_REQUIRED'
        ? event.canAskAgain ?? true
        : true,
    }),
  },
}).createMachine({
  id: 'qrCamera',
  initial: 'closed',
  context: { error: null, canAskAgain: true },
  states: {
    closed: {
      on: { OPEN: 'checking' },
    },
    checking: {
      on: {
        CHECK: 'checking',
        REQUEST: 'requesting',
        PERMISSION_GRANTED: { target: 'ready', actions: 'clearError' },
        PERMISSION_REQUIRED: {
          target: 'permission_required',
          actions: 'setPermissionMessage',
        },
        ERROR: { target: 'error', actions: 'setError' },
        CLOSE: 'closed',
      },
    },
    permission_required: {
      on: {
        REQUEST: { target: 'requesting', actions: 'clearError' },
        CHECK: 'checking',
        CLOSE: 'closed',
      },
    },
    requesting: {
      on: {
        PERMISSION_GRANTED: { target: 'ready', actions: 'clearError' },
        PERMISSION_REQUIRED: {
          target: 'permission_required',
          actions: 'setPermissionMessage',
        },
        ERROR: { target: 'error', actions: 'setError' },
        CLOSE: 'closed',
      },
    },
    ready: {
      on: {
        START: 'starting',
        RESET: 'ready',
        STOP: 'ready',
        ERROR: { target: 'error', actions: 'setError' },
        CLOSE: 'closed',
      },
    },
    starting: {
      on: {
        SCANNING: 'scanning',
        ERROR: { target: 'error', actions: 'setError' },
        CLOSE: 'closed',
      },
    },
    scanning: {
      on: {
        RESET: 'ready',
        STOP: 'ready',
        ERROR: { target: 'error', actions: 'setError' },
        CLOSE: 'closed',
      },
    },
    error: {
      on: {
        RETRY: { target: 'checking', actions: 'clearError' },
        REQUEST: { target: 'requesting', actions: 'clearError' },
        CLOSE: 'closed',
      },
    },
  },
});

/** React adapter for the shared camera lifecycle machine. */
export function useQrCameraSession() {
  const actorRef = useRef<ReturnType<typeof createActor<typeof qrCameraMachine>> | null>(null);
  if (!actorRef.current) {
    actorRef.current = createActor(qrCameraMachine);
  }

  const [snapshot, setSnapshot] = useState<SnapshotFrom<typeof qrCameraMachine>>(
    () => actorRef.current!.getSnapshot(),
  );

  useEffect(() => {
    const actor = actorRef.current!;
    const subscription = actor.subscribe((nextSnapshot) => setSnapshot(nextSnapshot));
    actor.start();
    setSnapshot(actor.getSnapshot());

    return () => {
      subscription.unsubscribe();
      actor.stop();
    };
  }, []);

  const send = useCallback((event: QrCameraMachineEvent) => {
    const actor = actorRef.current;
    if (actor && actor.getSnapshot().status !== 'stopped') {
      actor.send(event);
    }
  }, []);

  return {
    snapshot,
    status: snapshot.value as QrCameraStatus,
    error: snapshot.context.error,
    canAskAgain: snapshot.context.canAskAgain,
    send,
  };
}
