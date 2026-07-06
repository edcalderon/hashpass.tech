/// <reference types="jest" />

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  UIManager: {
    getViewManagerConfig: () => undefined,
  },
  Appearance: {
    getColorScheme: () => 'light',
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
