import { cameraPermissionManager } from '../../lib/camera-permissions';

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
});
