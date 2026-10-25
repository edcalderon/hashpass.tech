import { cameraPermissionManager } from '../../lib/camera-permissions';
import { Platform } from 'react-native';

const mockNativeGetPermissions = jest.fn();
const mockNativeRequestPermissions = jest.fn();

jest.mock('../../lib/barcode-scanner-compat', () => ({
  BarCodeScanner: {
    getPermissionsAsync: mockNativeGetPermissions,
    requestPermissionsAsync: mockNativeRequestPermissions,
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
