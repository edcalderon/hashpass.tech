/// <reference types="jest" />

jest.mock('react-native', () => ({
  AccessibilityInfo: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 1024, height: 768, scale: 1, fontScale: 1 })),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
  I18nManager: {
    isRTL: false,
  },
  PixelRatio: {
    get: () => 1,
  },
  Platform: { OS: 'android' },
  UIManager: {
    getViewManagerConfig: () => undefined,
  },
  Appearance: {
    getColorScheme: () => 'light',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn(),
  },
  View: 'View',
}));

jest.mock('expo-blur', () => {
  throw new Error('Native module missing');
});

describe('SafeBlurView', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('falls back to a plain view when the Expo blur native view is unavailable', () => {
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const SafeBlurView = require('../../components/SafeBlurView').default as (
        props: Record<string, unknown>
      ) => { type: string };

      const element = SafeBlurView({
        intensity: 20,
        tint: 'dark',
        style: { padding: 12 },
        children: 'content',
      });

      expect(element.type).toBe('View');
    });
  });
});
