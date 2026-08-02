/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockCheckForUpdate = jest.fn();
const mockFetchUpdate = jest.fn();
const mockReload = jest.fn();

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
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
  Platform: { OS: 'android' },
  useColorScheme: () => 'light',
}));

jest.mock(
  'react-native-css-interop/src/runtime/native/appearance-observables',
  () => ({
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('react-native-css-interop', () => ({
  createInteropElement: require('react').createElement,
}));

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: (...args: unknown[]) => mockCheckForUpdate(...args),
  fetchUpdateAsync: (...args: unknown[]) => mockFetchUpdate(...args),
  reloadAsync: (...args: unknown[]) => mockReload(...args),
}));

import { useOtaUpdate } from '../../hooks/useOtaUpdate';

let latest: ReturnType<typeof useOtaUpdate> | null = null;
const appStateListener = () => require('react-native').AppState.addEventListener as jest.Mock;

function CaptureOtaUpdate() {
  latest = useOtaUpdate();
  return null;
}

const renderHook = async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(CaptureOtaUpdate));
  });
  return renderer;
};

describe('useOtaUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latest = null;
    appStateListener().mockReturnValue({ remove: jest.fn() });
    mockCheckForUpdate.mockResolvedValue({ isAvailable: false });
    mockFetchUpdate.mockResolvedValue({ isNew: false });
    mockReload.mockResolvedValue(undefined);
  });

  it('checks on launch and remains idle when no compatible update exists', async () => {
    const renderer = await renderHook();

    expect(mockCheckForUpdate).toHaveBeenCalledTimes(1);
    expect(latest?.state).toBe('idle');
    expect(appStateListener()).toHaveBeenCalledWith('change', expect.any(Function));

    await act(async () => renderer.unmount());
  });

  it('downloads an available update and reloads only after it is ready', async () => {
    mockCheckForUpdate.mockResolvedValue({ isAvailable: true });
    mockFetchUpdate.mockResolvedValue({ isNew: true });
    const renderer = await renderHook();

    expect(latest?.state).toBe('ready');
    expect(mockFetchUpdate).toHaveBeenCalledTimes(1);

    await act(async () => { await latest?.applyUpdate(); });
    expect(mockReload).toHaveBeenCalledTimes(1);

    await act(async () => renderer.unmount());
  });

  it('returns to idle when a fetched update is no longer new', async () => {
    const renderer = await renderHook();
    mockCheckForUpdate.mockResolvedValue({ isAvailable: true });
    mockFetchUpdate.mockResolvedValue({ isNew: false });

    let result = false;
    await act(async () => { result = await latest!.checkForUpdate(true); });

    expect(result).toBe(false);
    expect(latest?.state).toBe('idle');
    await act(async () => renderer.unmount());
  });

  it('records an error and retries when the app returns to the foreground', async () => {
    let onAppStateChange: ((state: string) => void) | undefined;
    appStateListener().mockImplementation((_event: string, listener: (state: string) => void) => {
      onAppStateChange = listener;
      return { remove: jest.fn() };
    });
    mockCheckForUpdate.mockRejectedValueOnce(new Error('offline'));
    const renderer = await renderHook();
    expect(latest?.state).toBe('error');

    mockCheckForUpdate.mockResolvedValue({ isAvailable: false });
    await act(async () => { onAppStateChange?.('active'); });

    expect(mockCheckForUpdate).toHaveBeenCalledTimes(2);
    expect(latest?.state).toBe('idle');
    await act(async () => renderer.unmount());
  });
});
