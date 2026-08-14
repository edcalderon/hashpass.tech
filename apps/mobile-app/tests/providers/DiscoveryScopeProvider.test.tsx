/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: (...args: unknown[]) => mockSetItem(...args),
  },
}));

type DiscoveryScopeValue = {
  showAllTenants: boolean;
  setShowAllTenants: (enabled: boolean) => Promise<void>;
  isEditable: boolean;
  isReady: boolean;
};

// isMainBranch is a module-level constant baked in at import time, so
// varying it between test groups requires a fresh module registry per
// scenario. React and react-test-renderer must be required from that same
// fresh registry too -- mixing a top-level `import React` with a
// jest.isolateModules-required provider pulls in two separate React
// instances and crashes hooks with "Cannot read properties of null".
function loadHarness(isMainBranch: boolean) {
  let React: typeof import('react');
  let TestRenderer: typeof import('react-test-renderer');
  let DiscoveryScopeProvider: React.ComponentType<{
    children: React.ReactNode;
  }>;
  let useDiscoveryScope: () => DiscoveryScopeValue;

  jest.isolateModules(() => {
    jest.resetModules();
    jest.doMock('../../lib/event-detector', () => ({ isMainBranch }));

    React = require('react');
    TestRenderer = require('react-test-renderer');
    const mod = require('../../providers/DiscoveryScopeProvider');
    DiscoveryScopeProvider = mod.DiscoveryScopeProvider;
    useDiscoveryScope = mod.useDiscoveryScope;
  });

  let latest: DiscoveryScopeValue | null = null;
  function CaptureContext() {
    latest = useDiscoveryScope();
    return null;
  }

  return {
    React: React!,
    TestRenderer: TestRenderer!,
    DiscoveryScopeProvider: DiscoveryScopeProvider!,
    useDiscoveryScope: useDiscoveryScope!,
    CaptureContext,
    getLatest: () => latest,
  };
}

const flushPromises = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('DiscoveryScopeProvider', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockSetItem.mockResolvedValue(undefined);
  });

  describe('on a whitelabel tenant (isMainBranch = false)', () => {
    it('defaults to off and editable when storage has no saved preference', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      const { React, TestRenderer, DiscoveryScopeProvider, CaptureContext, getLatest } =
        loadHarness(false);

      let renderer: import('react-test-renderer').ReactTestRenderer;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(
          React.createElement(
            DiscoveryScopeProvider,
            null,
            React.createElement(CaptureContext),
          ),
        );
        await flushPromises();
      });

      expect(getLatest()?.showAllTenants).toBe(false);
      expect(getLatest()?.isEditable).toBe(true);
      expect(getLatest()?.isReady).toBe(true);
      expect(mockGetItem).toHaveBeenCalledWith('@discovery_show_all_tenants');

      await TestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('hydrates a previously-saved "on" preference from storage', async () => {
      mockGetItem.mockResolvedValueOnce('true');
      const { React, TestRenderer, DiscoveryScopeProvider, CaptureContext, getLatest } =
        loadHarness(false);

      let renderer: import('react-test-renderer').ReactTestRenderer;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(
          React.createElement(
            DiscoveryScopeProvider,
            null,
            React.createElement(CaptureContext),
          ),
        );
        await flushPromises();
      });

      expect(getLatest()?.showAllTenants).toBe(true);

      await TestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('persists a toggle to AsyncStorage and updates state', async () => {
      mockGetItem.mockResolvedValueOnce(null);
      const { React, TestRenderer, DiscoveryScopeProvider, CaptureContext, getLatest } =
        loadHarness(false);

      let renderer: import('react-test-renderer').ReactTestRenderer;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(
          React.createElement(
            DiscoveryScopeProvider,
            null,
            React.createElement(CaptureContext),
          ),
        );
        await flushPromises();
      });

      await TestRenderer.act(async () => {
        await getLatest()?.setShowAllTenants(true);
      });

      expect(mockSetItem).toHaveBeenCalledWith(
        '@discovery_show_all_tenants',
        'true',
      );
      expect(getLatest()?.showAllTenants).toBe(true);

      await TestRenderer.act(async () => {
        renderer.unmount();
      });
    });

  });

  describe('on the main hashpass.tech domain (isMainBranch = true)', () => {
    it('is always on, not editable, ready immediately, and never touches storage', async () => {
      const { React, TestRenderer, DiscoveryScopeProvider, CaptureContext, getLatest } =
        loadHarness(true);

      let renderer: import('react-test-renderer').ReactTestRenderer;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(
          React.createElement(
            DiscoveryScopeProvider,
            null,
            React.createElement(CaptureContext),
          ),
        );
        await flushPromises();
      });

      expect(getLatest()?.showAllTenants).toBe(true);
      expect(getLatest()?.isEditable).toBe(false);
      expect(getLatest()?.isReady).toBe(true);
      expect(mockGetItem).not.toHaveBeenCalled();

      await TestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('ignores an attempt to turn the setting off', async () => {
      const { React, TestRenderer, DiscoveryScopeProvider, CaptureContext, getLatest } =
        loadHarness(true);

      let renderer: import('react-test-renderer').ReactTestRenderer;
      await TestRenderer.act(async () => {
        renderer = TestRenderer.create(
          React.createElement(
            DiscoveryScopeProvider,
            null,
            React.createElement(CaptureContext),
          ),
        );
        await flushPromises();
      });

      await TestRenderer.act(async () => {
        await getLatest()?.setShowAllTenants(false);
      });

      expect(mockSetItem).not.toHaveBeenCalled();
      expect(getLatest()?.showAllTenants).toBe(true);

      await TestRenderer.act(async () => {
        renderer.unmount();
      });
    });
  });
});
