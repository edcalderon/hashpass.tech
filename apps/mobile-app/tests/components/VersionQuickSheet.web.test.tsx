/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockApiGet = jest.fn();
const mockClearAllCaches = jest.fn(async () => {});
const mockPerformHardReload = jest.fn();

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Dimensions: { get: jest.fn(() => ({ width: 390, height: 844, scale: 1, fontScale: 1 })), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Appearance: { getColorScheme: jest.fn(() => 'light'), addChangeListener: jest.fn(), addEventListener: jest.fn() },
  Linking: { canOpenURL: jest.fn(async () => true), openURL: jest.fn(async () => {}) },
  Modal: 'Modal',
  Platform: { OS: 'web' },
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
jest.mock('../../lib/version-checker', () => ({
  clearAllCaches: () => mockClearAllCaches(),
  performHardReload: () => mockPerformHardReload(),
}));
jest.mock('../../lib/services/version-service', () => ({
  versionService: {
    getCurrentVersion: () => ({ version: '1.8.313', releaseDate: '2026-08-03', releaseType: 'stable', notes: 'Test release' }),
    getBuildInfo: () => ({ buildId: 'build-test', buildTime: '2026-08-03T00:00:00.000Z', gitCommit: 'abc123', gitBranch: 'develop', gitCommitUrl: null }),
    getVersionBadgeInfo: () => ({ text: 'STABLE', color: '#16a34a' }),
  },
}));
jest.mock('../../hooks/useOtaUpdate', () => ({
  useOtaUpdate: () => ({ state: 'unsupported', applyUpdate: jest.fn(), checkForUpdate: jest.fn() }),
}));
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

async function pressLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const target = renderer.root.find((node: any) => node.props.accessibilityLabel === label);
  await act(async () => { await target.props.onPress(); });
}

async function pressText(renderer: TestRenderer.ReactTestRenderer, label: string) {
  const textNode = renderer.root.findAllByType('Text' as any).find((node: any) => String(node.props.children ?? '') === label);
  const parent = textNode?.parent;
  if (!parent?.props?.onPress) throw new Error(`No pressable text found: ${label}`);
  await act(async () => { await parent.props.onPress(); });
}

describe('VersionQuickSheet on web', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ success: true, data: { nativeVersion: '1.8.314', currentVersion: '1.8.314' } });
  });

  it('uses generic "Check for updates" wording, not Play Store wording', () => {
    const renderer = renderSheet();
    expect(textContent(renderer)).toContain('Check for updates');
    expect(textContent(renderer)).not.toContain('Play Store');
  });

  it('re-checks and reports "latest version" (not "native version") once up to date', async () => {
    mockApiGet.mockResolvedValueOnce({ success: true, data: { nativeVersion: '1.8.313', currentVersion: '1.8.313' } });
    const renderer = renderSheet();
    await pressLabel(renderer, 'Check for updates');
    expect(textContent(renderer)).toContain("You're on the latest version");
  });

  it('clears caches and hard-reloads instead of a plain reload when Update is pressed', async () => {
    const renderer = renderSheet();
    await pressLabel(renderer, 'Check for updates');
    expect(textContent(renderer)).toContain('v1.8.314 is available');

    await pressText(renderer, 'Update');
    expect(mockClearAllCaches).toHaveBeenCalledTimes(1);
    expect(mockPerformHardReload).toHaveBeenCalledTimes(1);
  });
});
