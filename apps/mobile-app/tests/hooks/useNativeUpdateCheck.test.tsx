/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockFetch = jest.fn();
const mockInstalledVersion = jest.fn((_fallbackVersion: string) => '1.9.49');

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AccessibilityInfo: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
  },
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  I18nManager: { isRTL: false },
  PixelRatio: { get: () => 1 },
  Platform: { OS: 'android' },
}));

jest.mock('react-native-css-interop', () => ({
  createInteropElement: require('react').createElement,
}));

jest.mock('../../config/runtime-version', () => ({
  compareAppVersions: (left: string, right: string) => left.localeCompare(right),
  getInstalledNativeAppVersion: (fallbackVersion: string) => mockInstalledVersion(fallbackVersion),
}));

import { useNativeUpdateCheck } from '../../hooks/useNativeUpdateCheck';

let latest: ReturnType<typeof useNativeUpdateCheck> | null = null;

function CaptureNativeUpdateCheck() {
  latest = useNativeUpdateCheck();
  return null;
}

describe('useNativeUpdateCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latest = null;
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        nativeVersion: '1.9.50',
        minimumVersion: '1.8.9',
        androidStoreUrl: 'market://details?id=tech.hashpass.app',
      }),
    });
  });

  it('checks native update status using the installed binary version, not the OTA bundle version', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<CaptureNativeUpdateCheck />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockInstalledVersion).toHaveBeenCalledWith('1.9.51');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('clientVersion=1.9.49'),
      expect.objectContaining({ headers: { 'X-Client-Version': '1.9.49' } }),
    );
    expect(latest).toMatchObject({ needsSoftUpdate: true, latestVersion: '1.9.50' });

    await act(async () => renderer.unmount());
  });
});
