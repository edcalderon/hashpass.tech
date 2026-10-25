export type QrCameraStatus =
  | 'closed'
  | 'checking'
  | 'permission_required'
  | 'requesting'
  | 'ready'
  | 'starting'
  | 'scanning'
  | 'error';

export type QrCameraMachineEvent =
  | { type: 'OPEN' }
  | { type: 'CHECK' }
  | { type: 'REQUEST' }
  | { type: 'PERMISSION_REQUIRED'; message?: string; canAskAgain?: boolean }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'START' }
  | { type: 'SCANNING' }
  | { type: 'RESET' }
  | { type: 'STOP' }
  | { type: 'ERROR'; message: string }
  | { type: 'RETRY' }
  | { type: 'CLOSE' };

export type QrCameraContext = {
  error: string | null;
  canAskAgain: boolean;
};
