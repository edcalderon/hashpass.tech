/// <reference types="jest" />

const mockGetRuntimeVersion = jest.fn();
const mockApiGet = jest.fn();
const mockReplace = jest.fn();
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
      href: 'https://hashpass.tech/dashboard',
      replace: mockReplace,
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
    getItem: jest.fn(),
    setItem: jest.fn(),
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
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('_hpv='));
  });

  // Regression test for a production incident: checkVersionOnStart() calls
  // checkVersionAndClearCache(true) on every fresh page load, and a
  // needsUpdate=true result reloads the page via window.location.reload() —
  // which fully remounts the app and re-runs checkVersionOnStart() from
  // scratch. The cooldown previously only applied when forceCheck was
  // false, so if the deployed backend version kept moving (e.g. during a
  // string of rapid releases), every reload immediately re-detected
  // "update available" and reloaded again with zero rate limiting — an
  // infinite reload loop on any page outside /events/ or /dashboard.
  it('does not reload again within the cooldown window, even when forced', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.8.156',
        versionInfo: {
          needsUpdate: true,
        },
      },
    });

    (global as any).localStorage.getItem = jest.fn(() => String(Date.now() - 1000));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkVersionAndClearCache } = require('../../lib/version-checker');
    const wasCleared = await checkVersionAndClearCache(true);

    expect(wasCleared).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('never retries the same forced update after a cache-clearing reload has already run', async () => {
    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.8.156',
        versionInfo: {
          needsUpdate: true,
        },
      },
    });
    (global as any).sessionStorage.getItem = jest.fn(() => '1.8.154:1.8.156');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkVersionAndClearCache } = require('../../lib/version-checker');
    const wasCleared = await checkVersionAndClearCache(true);

    expect(wasCleared).toBe(false);
    expect(mockCacheDelete).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // Regression test for a production incident: an actively-browsing user
  // (any /events/ or /dashboard page -- this app's core usage pattern) never
  // got a version check at all, forced or soft, because checkVersionOnStart()
  // used to just reschedule itself and return without ever establishing the
  // periodic setInterval when the user was active at the very first check.
  // A user who stayed active for their whole session could be stuck on a
  // stale bundle indefinitely with no update banner and no way to discover
  // it short of manually hard-refreshing.
  it('still runs a periodic soft check when the user is active at startup, instead of never checking at all', async () => {
    jest.useFakeTimers();
    (global as any).window.location.pathname = '/events/chile2026/speakers';
    (global as any).document = { hidden: false };
    (global as any).window.dispatchEvent = jest.fn();

    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.8.156',
        versionInfo: { needsUpdate: true },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkVersionOnStart } = require('../../lib/version-checker');
    checkVersionOnStart();

    // Initial 2s delay: the user is active, so the disruptive reload path
    // must not run.
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();

    // The periodic interval must still have been established even though
    // the user was active at startup -- this is the actual regression.
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(mockApiGet).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hashpass:version-update' })
    );

    jest.useRealTimers();
  });

  // Regression test for the isUserActive() route-allowlist bug: a visible,
  // focused user on a page outside /events/ or /dashboard used to be
  // silently hard-reloaded instead of ever seeing the soft update modal.
  // Visibility alone should now be enough to take the soft path anywhere.
  it('takes the soft path for a visible user on a route outside /events/ or /dashboard', async () => {
    jest.useFakeTimers();
    (global as any).window.location.pathname = '/settings';
    (global as any).document = { hidden: false };
    (global as any).window.dispatchEvent = jest.fn();

    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.8.156',
        versionInfo: { needsUpdate: true },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkVersionOnStart } = require('../../lib/version-checker');
    checkVersionOnStart();

    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(10 * 60 * 1000);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hashpass:version-update' })
    );

    jest.useRealTimers();
  });

  // notifyVersionUpdateFromServiceWorker is driven by app/+html.tsx's
  // controllerchange-based hashpassServiceWorkerUpdate event -- a confirmed
  // signal, not a poll -- so it must resolve real version strings and
  // dispatch regardless of the REST-poll cooldown.
  it('notifies an update from the service worker signal without checking the poll cooldown', async () => {
    (global as any).window.dispatchEvent = jest.fn();
    (global as any).localStorage.getItem = jest.fn(() => String(Date.now()));

    mockApiGet.mockResolvedValue({
      success: true,
      data: {
        currentVersion: '1.8.156',
        versionInfo: { needsUpdate: true },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { notifyVersionUpdateFromServiceWorker } = require('../../lib/version-checker');
    await notifyVersionUpdateFromServiceWorker();

    expect(mockApiGet).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hashpass:version-update',
        detail: { currentVersion: '1.8.154', latestVersion: '1.8.156' },
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
