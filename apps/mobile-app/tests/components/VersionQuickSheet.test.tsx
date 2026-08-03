/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockApiGet = jest.fn();
const mockOpenUrl = jest.fn();
const mockApplyUpdate = jest.fn();
const mockCheckForUpdate = jest.fn();
let mockOtaState: 'idle' | 'checking' | 'downloading' | 'ready' | 'error' = 'idle';

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Dimensions: { get: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Appearance: { getColorScheme: jest.fn(() => 'light'), addChangeListener: jest.fn(), addEventListener: jest.fn() },
  Linking: { canOpenURL: jest.fn(async () => true), openURL: async (...args: unknown[]) => { mockOpenUrl(...args); } },
  Modal: 'Modal',
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));
jest.mock('react-native-css-interop/src/runtime/native/appearance-observables', () => ({
  addChangeListener: jest.fn(),
  addEventListener: jest.fn(),
  removeChangeListener: jest.fn(),
  removeEventListener: jest.fn(),
  resetAppearanceListeners: jest.fn(),
}), { virtual: true });
jest.mock('react-native-css-interop', () => ({ createInteropElement: require('react').createElement }), { virtual: true });

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#b91c1c',
      divider: '#e5e7eb',
      background: { default: '#fff', paper: '#fff' },
      text: { primary: '#111827', secondary: '#4b5563' },
    },
  }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string, params?: Record<string, unknown>) =>
      fallback.replace(/\{(\w+)\}/g, (_, key) => String(params?.[key] ?? `{${key}}`)),
  }),
}));

jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockApiGet(...args) } }));
jest.mock('../../lib/services/version-service', () => ({
  versionService: {
    getCurrentVersion: () => ({ version: '1.8.313', releaseDate: '2026-08-03', releaseType: 'stable', notes: 'Test release' }),
    getBuildInfo: () => ({ buildId: 'build-test', buildTime: '2026-08-03T00:00:00.000Z', gitCommit: 'abc123', gitBranch: 'develop', gitCommitUrl: null }),
    getVersionBadgeInfo: () => ({ text: 'STABLE', color: '#16a34a' }),
  },
}));
jest.mock('../../hooks/useOtaUpdate', () => ({
  useOtaUpdate: () => ({ state: mockOtaState, applyUpdate: mockApplyUpdate, checkForUpdate: mockCheckForUpdate }),
}));
// handleCheckForUpdates compares against packageJson.version directly (not
// the mocked versionService above), so without this mock the "current
// version" here silently tracks the real repo version and this test starts
// failing every time a release bumps it past the nativeVersion fixtures below.
jest.mock('../../package.json', () => ({ version: '1.8.313' }));

import VersionQuickSheet from '../../components/VersionQuickSheet';

function renderSheet() {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<VersionQuickSheet visible onClose={jest.fn()} onExpand={jest.fn()} />);
  });
  return renderer;
}

function textContent(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType('Text' as any).map((node: any) => String(node.props.children ?? '')).join(' ');
}

async function pressText(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const textNode = renderer.root.findAllByType('Text' as any).find((node: any) => String(node.props.children ?? '') === label);
  const parent = textNode?.parent;
  if (!parent?.props?.onPress) throw new Error(`No pressable text found: ${label}`);
  await act(async () => { await parent.props.onPress(); });
}

async function pressLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const target = renderer.root.find((node: any) => node.props.accessibilityLabel === label);
  await act(async () => { await target.props.onPress(); });
}

describe('VersionQuickSheet update flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOtaState = 'idle';
    mockApiGet.mockResolvedValue({ success: true, data: { nativeVersion: '1.8.313', currentVersion: '1.8.314' } });
  });

  it('keeps Play Store checking separate from OTA checking', async () => {
    const renderer = renderSheet();
    expect(textContent(renderer)).toContain('Check for Play Store updates');
    expect(textContent(renderer)).toContain('Check for OTA updates');

    await pressLabel(renderer, 'Check for Play Store updates');
    expect(textContent(renderer)).toContain("You're on the latest native version");
    await pressLabel(renderer, 'Check for OTA updates');
    expect(mockCheckForUpdate).toHaveBeenCalledWith(true);
  });

  it('shows the native update action only when a Play artifact is newer', async () => {
    mockApiGet.mockResolvedValue({ success: true, data: { nativeVersion: '1.8.314', currentVersion: '1.8.314', androidStoreUrl: 'market://details?id=club.hashpass.app', androidStoreWebUrl: 'https://play.google.com' } });
    const renderer = renderSheet();
    await pressLabel(renderer, 'Check for Play Store updates');
    expect(textContent(renderer)).toContain('v1.8.314 is available');
    await pressText(renderer, 'Update');
    expect(mockOpenUrl).toHaveBeenCalledWith('market://details?id=club.hashpass.app');
  });

  it('falls back to the web store and renders API check errors', async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: { nativeVersion: '1.8.314', androidStoreWebUrl: 'https://play.google.com' } });
    const renderer = renderSheet();
    await pressLabel(renderer, 'Check for Play Store updates');
    expect(textContent(renderer)).toContain('v1.8.314 is available');
    const linking = require('react-native').Linking;
    linking.canOpenURL.mockResolvedValueOnce(false);
    await pressText(renderer, 'Update');
    expect(mockOpenUrl).toHaveBeenCalledWith('https://play.google.com');

    mockApiGet.mockResolvedValueOnce({ success: false, data: null });
    const errorRenderer = renderSheet();
    await pressLabel(errorRenderer, 'Check for Play Store updates');
    expect(textContent(errorRenderer)).toContain("Couldn't check — tap to retry");
  });

  it('renders OTA downloading, ready/restart, and error states', async () => {
    mockOtaState = 'downloading';
    let renderer = renderSheet();
    expect(textContent(renderer)).toContain('Downloading OTA update');

    mockOtaState = 'ready';
    renderer = renderSheet();
    await pressLabel(renderer, 'Restart to apply OTA update');
    expect(mockApplyUpdate).toHaveBeenCalled();

    mockOtaState = 'error';
    renderer = renderSheet();
    expect(textContent(renderer)).toContain('OTA check failed');
    await pressText(renderer, 'OTA check failed — tap to retry');
    expect(mockCheckForUpdate).toHaveBeenCalledWith(true);
  });
});
