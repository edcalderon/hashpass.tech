/// <reference types="jest" />

describe('SafeLinearGradient', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.dontMock('expo-linear-gradient');
    jest.dontMock('react-native');
  });

  it('falls back to a plain view when the Expo gradient module cannot be loaded', () => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'android' },
      UIManager: {
        getViewManagerConfig: () => ({}),
      },
      Appearance: {
        getColorScheme: () => 'light',
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
