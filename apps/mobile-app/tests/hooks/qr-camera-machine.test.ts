import { createActor } from 'xstate';
import { renderHook, act } from '@testing-library/react-native';
import { qrCameraMachine, useQrCameraSession } from '../../hooks/qr-camera-machine';
import type { QrCameraMachineEvent } from '../../types/qr-camera.types';

const start = () => {
  const actor = createActor(qrCameraMachine);
  actor.start();
  return actor;
};

describe('QR camera session machine', () => {
  it('requires a permission decision before starting the scanner', () => {
    const actor = start();
    actor.send({ type: 'OPEN' });
    expect(actor.getSnapshot().value).toBe('checking');

    actor.send({ type: 'PERMISSION_REQUIRED', message: 'Allow camera access' } as QrCameraMachineEvent);
    expect(actor.getSnapshot().value).toBe('permission_required');

    actor.send({ type: 'REQUEST' });
    expect(actor.getSnapshot().value).toBe('requesting');
  });

  it('moves through ready and scanning only after explicit startup', () => {
    const actor = start();
    actor.send({ type: 'OPEN' });
    actor.send({ type: 'PERMISSION_GRANTED' });
    expect(actor.getSnapshot().value).toBe('ready');

    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toBe('starting');
    actor.send({ type: 'SCANNING' });
    expect(actor.getSnapshot().value).toBe('scanning');
  });

  it('ignores late camera events after the modal closes', () => {
    const actor = start();
    actor.send({ type: 'OPEN' });
    actor.send({ type: 'CLOSE' });
    actor.send({ type: 'PERMISSION_GRANTED' });
    actor.send({ type: 'SCANNING' });
    expect(actor.getSnapshot().value).toBe('closed');
  });

  it('supports retry after a camera startup error', () => {
    const actor = start();
    actor.send({ type: 'OPEN' });
    actor.send({ type: 'PERMISSION_GRANTED' });
    actor.send({ type: 'START' });
    actor.send({ type: 'ERROR', message: 'Camera is busy' } as QrCameraMachineEvent);
    expect(actor.getSnapshot().value).toBe('error');
    expect(actor.getSnapshot().context.error).toBe('Camera is busy');

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('checking');
    expect(actor.getSnapshot().context.error).toBeNull();
  });

  it('exposes the machine through the React hook and stops cleanly on unmount', () => {
    const { result, unmount } = renderHook(() => useQrCameraSession());

    act(() => {
      result.current.send({ type: 'OPEN' });
      result.current.send({ type: 'PERMISSION_GRANTED' });
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
    expect(result.current.canAskAgain).toBe(true);

    unmount();
  });
});
