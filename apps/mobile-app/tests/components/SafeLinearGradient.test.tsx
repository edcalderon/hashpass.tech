/// <reference types="jest" />

describe('SafeLinearGradient', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('falls back to a plain view when the Expo gradient module cannot be loaded', () => {
    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({
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
        Platform: { OS: 'android' },
        UIManager: {
          getViewManagerConfig: () => ({}),
        },
        PixelRatio: {
          get: () => 1,
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

      jest.doMock('expo-linear-gradient', () => {
        throw new Error('Native module missing');
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const SafeLinearGradient = require('../../components/SafeLinearGradient').default as (
        props: Record<string, unknown>
      ) => { type: string };

      const element = SafeLinearGradient({
        colors: ['#101114', '#23262d'],
        style: { padding: 12 },
        children: 'content',
      });

      expect(element.type).toBe('View');
    });
  });
});
