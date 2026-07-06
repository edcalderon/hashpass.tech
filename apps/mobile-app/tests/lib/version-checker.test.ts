/// <reference types="jest" />

const mockGetRuntimeVersion = jest.fn();
const mockApiGet = jest.fn();
const mockReload = jest.fn();
const mockCacheKeys = jest.fn();
const mockCacheDelete = jest.fn();
const mockUnregister = jest.fn();
const mockGetRegistrations = jest.fn();

jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
  },
}));

jest.mock('../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
  },
}));

jest.mock('../../config/runtime-version', () => ({
  compareAppVersions: (left: string, right: string) => {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);

    for (let index = 0; index < 3; index += 1) {
      const leftPart = leftParts[index] || 0;
      const rightPart = rightParts[index] || 0;
      if (leftPart < rightPart) return -1;
      if (leftPart > rightPart) return 1;
    }

    return 0;
  },
  getRuntimeVersion: (...args: unknown[]) => mockGetRuntimeVersion(...args),
}));

function installWebGlobals() {
  const caches = {
    keys: mockCacheKeys,
    delete: mockCacheDelete,
  };

  (global as any).window = {
    caches,
    location: {
      reload: mockReload,
    },
  };

  (global as any).caches = caches;

  (global as any).navigator = {
    serviceWorker: {
      getRegistrations: mockGetRegistrations,
    },
  };

  (global as any).localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn(),
  };

  (global as any).sessionStorage = {
    clear: jest.fn(),
  };
}

describe('version checker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    installWebGlobals();

    mockGetRuntimeVersion.mockReturnValue('1.8.154');
    mockCacheKeys.mockResolvedValue(['hashpass-static-v1.8.154']);
    mockCacheDelete.mockResolvedValue(true);
    mockUnregister.mockResolvedValue(true);
    mockGetRegistrations.mockResolvedValue([
      {
        unregister: mockUnregister,
      },
    ]);
  });

  it('clears stale web caches and reloads on startup when a newer version is available', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.8.156',
        versionInfo: {
          needsUpdate: true,
        },
      },
    });

    // Loaded lazily so the mocked web globals exist before the module initializes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkVersionAndClearCache } = require('../../lib/version-checker');
    const wasCleared = await checkVersionAndClearCache(true);

    expect(wasCleared).toBe(true);
    expect(mockCacheKeys).toHaveBeenCalled();
    expect(mockCacheDelete).toHaveBeenCalled();
    expect(mockGetRegistrations).toHaveBeenCalled();
    expect(mockUnregister).toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalled();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
