import { cameraPermissionManager, type CameraPermissionResult } from '../../lib/camera-permissions';
import { Platform } from 'react-native';

const mockNativeGetPermissions = jest.fn();
const mockNativeRequestPermissions = jest.fn();

jest.mock('expo-camera', () => ({
  __esModule: true,
  CameraView: 'CameraView',
  Camera: {
    getCameraPermissionsAsync: () => mockNativeGetPermissions(),
    requestCameraPermissionsAsync: () => mockNativeRequestPermissions(),
  },
}));

describe('web camera permissions', () => {
  const mockGetUserMedia = jest.fn();
  const mockQuery = jest.fn();
  const mockWindow = { isSecureContext: true };

  beforeEach(() => {
    mockWindow.isSecureContext = true;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWindow });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: { getUserMedia: mockGetUserMedia },
        permissions: { query: mockQuery },
      },
    });
    mockGetUserMedia.mockReset();
    mockQuery.mockReset().mockResolvedValue({ state: 'prompt' });
    mockNativeGetPermissions.mockReset();
    mockNativeRequestPermissions.mockReset();
    Platform.OS = 'web';
  });

  afterEach(() => {
    Platform.OS = 'web';
  });

  it('checks browser permission state without opening the camera', async () => {
    const result = await cameraPermissionManager.getPermissionStatus();

    expect(result.status).toBe('undetermined');
    expect(result.canAskAgain).toBe(true);
    expect(mockGetUserMedia).not.toHaveBeenCalled();
    expect(mockNativeGetPermissions).not.toHaveBeenCalled();
  });

  it('opens one stream from the explicit request and closes its tracks', async () => {
    const stop = jest.fn();
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });

    const result = await cameraPermissionManager.requestWithFallback();

    expect(result.status).toBe('granted');
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(mockNativeRequestPermissions).not.toHaveBeenCalled();
  });

  it('reports a browser denial as blocked without retrying in the background', async () => {
    mockGetUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
    mockQuery.mockResolvedValue({ state: 'denied' });

    const result = await cameraPermissionManager.requestWithFallback();

    expect(result.status).toBe('blocked');
    expect(result.canAskAgain).toBe(false);
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });

  it('rechecks navigator permission when the camera device is unavailable', async () => {
    mockGetUserMedia.mockRejectedValue({ name: 'NotFoundError' });
    mockQuery.mockResolvedValue({ state: 'granted' });

    const result = await cameraPermissionManager.requestWithFallback();

    expect(result.status).toBe('undetermined');
    expect(result.canAskAgain).toBe(true);
    expect(result.message).toContain('No camera was found');
    expect(mockQuery).toHaveBeenCalledWith({ name: 'camera' });
  });

  it('reports an insecure context without touching browser media APIs', async () => {
    mockWindow.isSecureContext = false;

    await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  it('reports browsers without getUserMedia as unsupported', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    });

    await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
    await expect(cameraPermissionManager.requestWithFallback()).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
  });

  it('reports insecure contexts from a user-triggered permission request', async () => {
    mockWindow.isSecureContext = false;

    await expect(cameraPermissionManager.requestPermission(true)).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
  });

  it('maps a denied browser permission query to a blocked result', async () => {
    mockQuery.mockResolvedValue({ state: 'denied' });

    await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
  });

  it('recognizes an already granted browser permission', async () => {
    mockQuery.mockResolvedValue({ state: 'granted' });

    await expect(cameraPermissionManager.getPermissionStatus(true)).resolves.toMatchObject({
      status: 'granted',
      canAskAgain: false,
    });
  });

  it('reconciles a browser permission query failure as retryable', async () => {
    mockQuery.mockRejectedValue(new Error('Permissions API unavailable'));

    await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
      status: 'undetermined',
      canAskAgain: true,
    });
  });

  it.each([
    ['NotReadableError', 'busy or unavailable'],
    ['OverconstrainedError', 'does not support'],
    ['SecurityError', 'security policy'],
    ['UnknownError', 'driver failed'],
  ])('returns a useful message for %s camera failures', async (name, message) => {
    mockGetUserMedia.mockRejectedValue({ name, message });
    mockQuery.mockResolvedValue({ state: 'prompt' });

    const result = await cameraPermissionManager.requestWithFallback();

    expect(result.status).toBe('undetermined');
    expect(result.canAskAgain).toBe(true);
    expect(result.message).toContain(name === 'UnknownError' ? message : message.split(' ')[0]);
  });

  it('detects a busy browser camera only after permission is granted', async () => {
    mockQuery.mockResolvedValue({ state: 'granted' });
    mockGetUserMedia.mockRejectedValue({ name: 'NotReadableError' });

    await expect(cameraPermissionManager.isCameraInUse()).resolves.toMatchObject({
      inUse: true,
    });
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });

  it('does not probe the camera while browser permission is unresolved', async () => {
    mockQuery.mockResolvedValue({ state: 'prompt' });

    await expect(cameraPermissionManager.isCameraInUse()).resolves.toEqual({ inUse: false });
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });
});
describe('native camera permissions', () => {
  beforeEach(() => {
    Platform.OS = 'android';
    mockNativeGetPermissions.mockReset();
    mockNativeRequestPermissions.mockReset();
  });

  afterEach(() => {
    Platform.OS = 'web';
  });

  it('uses the native grant response without probing or immediately re-reading it', async () => {
    mockNativeGetPermissions.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
    mockNativeRequestPermissions.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: false });

    await expect(cameraPermissionManager.requestWithFallback(true)).resolves.toMatchObject({
      status: 'granted',
      canAskAgain: false,
    });
    expect(mockNativeGetPermissions).toHaveBeenCalledTimes(1);
    expect(mockNativeRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('returns an existing native grant without requesting again', async () => {
    mockNativeGetPermissions.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: false });

    await expect(cameraPermissionManager.requestWithFallback()).resolves.toMatchObject({
      status: 'granted',
      canAskAgain: false,
    });
    expect(mockNativeRequestPermissions).not.toHaveBeenCalled();
  });

  it('stops before requesting when native permission is already blocked', async () => {
    mockNativeGetPermissions.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });

    await expect(cameraPermissionManager.requestWithFallback()).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
      message: 'Please enable camera permission in device settings to scan QR codes.',
    });
    expect(mockNativeRequestPermissions).not.toHaveBeenCalled();
  });

  it('normalizes an explicit native blocked response', async () => {
    mockNativeGetPermissions.mockResolvedValue({ status: 'blocked', granted: false, canAskAgain: false });

    await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
  });

  it('defaults a missing native canAskAgain flag to true', async () => {
    mockNativeGetPermissions.mockResolvedValue({ status: 'undetermined', granted: false });

    await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
      status: 'undetermined',
      canAskAgain: true,
    });
  });

  it('reports a native status lookup failure as undetermined', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockNativeGetPermissions.mockRejectedValue(new Error('native module unavailable'));

    try {
      await expect(cameraPermissionManager.getPermissionStatus()).resolves.toMatchObject({
        status: 'undetermined',
        canAskAgain: true,
        message: 'Unable to check camera permission status',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('reconciles a failed native request with a blocked status', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockNativeGetPermissions
      .mockResolvedValueOnce({ status: 'undetermined', granted: false, canAskAgain: true })
      .mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: false });
    mockNativeRequestPermissions.mockRejectedValue(new Error('permission sheet failed'));

    try {
      await expect(cameraPermissionManager.requestPermission()).resolves.toMatchObject({
        status: 'blocked',
        canAskAgain: false,
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('keeps the native request error detail when status reconciliation is inconclusive', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockNativeGetPermissions
      .mockResolvedValueOnce({ status: 'undetermined', granted: false, canAskAgain: true })
      .mockResolvedValueOnce({ status: 'undetermined', granted: false, canAskAgain: true });
    mockNativeRequestPermissions.mockRejectedValue(new Error('permission sheet failed'));

    try {
      await expect(cameraPermissionManager.requestPermission()).resolves.toMatchObject({
        status: 'undetermined',
        canAskAgain: true,
        message: 'Camera permission could not be requested. permission sheet failed',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('handles a still-denied native status that can be requested again', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockNativeGetPermissions
      .mockResolvedValueOnce({ status: 'undetermined', granted: false, canAskAgain: true })
      .mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: true });
    mockNativeRequestPermissions.mockRejectedValue('permission sheet failed');

    try {
      await expect(cameraPermissionManager.requestPermission()).resolves.toMatchObject({
        status: 'undetermined',
        canAskAgain: true,
        message: 'Camera permission could not be requested.',
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('preserves the request error when native status reconciliation also fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const getStatusSpy = jest.spyOn(cameraPermissionManager, 'getPermissionStatus')
      .mockRejectedValue(new Error('native status unavailable'));
    mockNativeRequestPermissions.mockRejectedValue(new Error('permission sheet failed'));

    try {
      await expect(cameraPermissionManager.requestPermission()).resolves.toMatchObject({
        status: 'undetermined',
        canAskAgain: true,
        message: 'Camera permission could not be requested. native status unavailable',
      });
    } finally {
      getStatusSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('maps a native denial that cannot be asked again to blocked', async () => {
    mockNativeGetPermissions.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: true });
    mockNativeRequestPermissions.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });

    await expect(cameraPermissionManager.requestWithFallback(true)).resolves.toMatchObject({
      status: 'blocked',
      canAskAgain: false,
    });
  });
});

describe('web camera permission upgrades', () => {
  const mockGetUserMedia = jest.fn();
  const mockQuery = jest.fn();
  const mockEnumerateDevices = jest.fn();
  const mockWindow = { isSecureContext: true };
  let manager: typeof cameraPermissionManager;

  const loadFreshManager = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../lib/camera-permissions').cameraPermissionManager as typeof cameraPermissionManager;
  };

  beforeEach(() => {
    Platform.OS = 'web';
    mockWindow.isSecureContext = true;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: mockWindow });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
        mediaDevices: { getUserMedia: mockGetUserMedia, enumerateDevices: mockEnumerateDevices },
        permissions: { query: mockQuery },
      },
    });
    manager = loadFreshManager();
    mockGetUserMedia.mockReset();
    mockQuery.mockReset().mockResolvedValue({ state: 'prompt' });
    mockEnumerateDevices.mockReset().mockResolvedValue([{ kind: 'videoinput' }]);
  });

  it('retries once with bare constraints when the browser over-constrains', async () => {
    const stop = jest.fn();
    mockGetUserMedia
      .mockRejectedValueOnce({ name: 'OverconstrainedError' })
      .mockResolvedValueOnce({ getTracks: () => [{ stop }] });

    const result = await manager.requestWithFallback();

    expect(result.status).toBe('granted');
    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(mockGetUserMedia).toHaveBeenLastCalledWith({ audio: false, video: true });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not prompt when the machine has no camera at all', async () => {
    mockEnumerateDevices.mockResolvedValue([{ kind: 'audioinput' }, { kind: 'audiooutput' }]);

    const result = await manager.requestWithFallback();

    expect(result.status).toBe('blocked');
    expect(result.canAskAgain).toBe(false);
    expect(result.message).toContain('No camera was found');
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });

  it('still prompts when Firefox hides the device list before permission', async () => {
    mockEnumerateDevices.mockResolvedValue([]);
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });

    const result = await manager.requestWithFallback();

    expect(result.status).toBe('granted');
    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
  });

  it('names Firefox when the prompt is dismissed or denied', async () => {
    mockGetUserMedia.mockRejectedValue({ name: 'NotAllowedError' });

    const result = await manager.requestWithFallback();

    expect(result.status).toBe('undetermined');
    expect(result.message).toContain('denied or dismissed');
    expect(result.message).toContain('address bar');
  });

  it('remembers a session grant when the Permissions API cannot report it', async () => {
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    expect((await manager.requestWithFallback()).status).toBe('granted');

    // Safari-like: the permissions query throws, so the grant must be remembered.
    mockQuery.mockRejectedValue(new Error('unsupported'));
    await expect(manager.getPermissionStatus()).resolves.toMatchObject({
      status: 'granted',
      canAskAgain: false,
    });
  });

  it('forgets the session grant once the browser reports the camera blocked', async () => {
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    await manager.requestWithFallback();

    mockGetUserMedia.mockRejectedValue({ name: 'NotAllowedError' });
    mockQuery.mockResolvedValue({ state: 'denied' });
    await manager.requestWithFallback();
    await expect(manager.getPermissionStatus()).resolves.toMatchObject({ status: 'blocked' });
  });

  it('watches the browser permission state and stops watching on demand', async () => {
    const seen: Array<string> = [];
    const changeHandlers = new Set<() => void>();
    const fireChange = () => changeHandlers.forEach((handler) => handler());
    // Real PermissionStatus objects mutate .state in place when the user
    // changes the setting, so the mock must read a live variable.
    let browserState: PermissionState = 'denied';
    mockQuery.mockImplementation(async () => ({
      get state() { return browserState; },
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'change') changeHandlers.add(handler);
      },
      removeEventListener: (event: string, handler: () => void) => {
        if (event === 'change') changeHandlers.delete(handler);
      },
    }));

    const unsubscribe = manager.watchWebPermission((result: CameraPermissionResult) => seen.push(result.status));
    await Promise.resolve(); // let the permissions query settle
    expect(changeHandlers.size).toBeGreaterThan(0);

    fireChange();
    expect(seen).toContain('blocked');

    // A flip to granted (the user enabling camera from the address bar) is
    // reported without touching getUserMedia from a background handler.
    browserState = 'granted';
    fireChange();
    expect(seen).toContain('granted');
    expect(mockGetUserMedia).not.toHaveBeenCalled();

    unsubscribe();
    fireChange();
    expect(seen.filter((status) => status === 'granted')).toHaveLength(1);
    manager.stopWatchingWebPermission();
  });

  it('reacts to hot-plugged cameras through the device watcher', async () => {
    const deviceHandlers = new Set<() => void>();
    const fireDeviceChange = () => deviceHandlers.forEach((handler) => handler());
    Object.defineProperty(globalThis.navigator.mediaDevices, 'addEventListener', {
      configurable: true,
      value: (event: string, handler: () => void) => {
        if (event === 'devicechange') deviceHandlers.add(handler);
      },
    });
    Object.defineProperty(globalThis.navigator.mediaDevices, 'removeEventListener', {
      configurable: true,
      value: (event: string, handler: () => void) => {
        if (event === 'devicechange') deviceHandlers.delete(handler);
      },
    });
    mockQuery.mockResolvedValue({ state: 'prompt' });

    const seen: Array<string> = [];
    const unsubscribe = manager.watchWebPermission((result: CameraPermissionResult) => seen.push(result.status));
    fireDeviceChange();
    // The device signal resolves the permission status through an async
    // chain (handler -> getWebPermissionStatus -> permissions query).
    for (let i = 0; i < 5 && seen.length === 0; i += 1) {
      await Promise.resolve();
    }

    expect(seen).toContain('undetermined');
    unsubscribe();
  });
});
