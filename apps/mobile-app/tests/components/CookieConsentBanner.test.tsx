/// <reference types="jest" />

const mockRouterPush = jest.fn();
const mockFetchIPLocation = jest.fn();

const mockColors = {
  primary: '#c81000',
  divider: '#dddddd',
  text: {
    primary: '#111111',
    secondary: '#555555',
  },
};

const createStorage = (initial: Record<string, string> = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
    }),
  };
};

const loadBanner = (platform: 'web' | 'android' = 'web') => {
  jest.resetModules();
  jest.doMock('react-native', () => ({
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
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
    },
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    Platform: { OS: platform },
    StyleSheet: { create: (styles: any) => styles },
    Text: 'Text',
    TouchableOpacity: 'TouchableOpacity',
    UIManager: {
      getViewManagerConfig: () => undefined,
    },
    View: 'View',
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
  }));
  jest.doMock(
    'react-native-css-interop/src/runtime/native/appearance-observables',
    () => ({
      addChangeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeChangeListener: jest.fn(),
      removeEventListener: jest.fn(),
      resetAppearanceListeners: jest.fn(),
    }),
    { virtual: true }
  );
  jest.doMock('expo-router', () => ({
    useRouter: () => ({ push: mockRouterPush }),
  }));
  jest.doMock('../../hooks/useTheme', () => ({
    useTheme: () => ({
      colors: mockColors,
      isDark: false,
    }),
  }));
  jest.doMock('../../i18n/i18n', () => ({
    useTranslation: () => ({
      t: (_key: string, fallback?: string) => fallback,
    }),
  }));
  jest.doMock('../../lib/ipquery', () => ({
    GDPR_COUNTRY_CODES: new Set(['DE', 'ES', 'FR']),
    fetchIPLocation: mockFetchIPLocation,
  }));

  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const CookieConsentBanner = require('../../components/CookieConsentBanner').default;
  return { React, TestRenderer, CookieConsentBanner };
};

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockFetchIPLocation.mockReset();
    (global as any).window = {
      localStorage: createStorage(),
      gtag: jest.fn(),
    };
    (global as any).localStorage = (global as any).window.localStorage;
  });

  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('expo-router');
    jest.dontMock('../../hooks/useTheme');
    jest.dontMock('../../i18n/i18n');
    jest.dontMock('../../lib/ipquery');
    delete (global as any).window;
    delete (global as any).localStorage;
  });

  it('does not render on native platforms', () => {
    const { React, TestRenderer, CookieConsentBanner } = loadBanner('android');

    let renderer: any;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(React.createElement(CookieConsentBanner));
    });

    expect(renderer.toJSON()).toBeNull();
    expect(mockFetchIPLocation).not.toHaveBeenCalled();
  });

  it('applies existing consent without showing the banner', async () => {
    (global as any).window.localStorage = createStorage({ hashpass_cookie_consent: 'denied' });
    (global as any).localStorage = (global as any).window.localStorage;
    const { React, TestRenderer, CookieConsentBanner } = loadBanner('web');

    let renderer: any;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(CookieConsentBanner));
    });

    expect(renderer.toJSON()).toBeNull();
    expect(mockFetchIPLocation).not.toHaveBeenCalled();
    expect((global as any).window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      { analytics_storage: 'denied' }
    );
  });

  it('shows jurisdiction copy, accepts analytics consent, and opens privacy', async () => {
    mockFetchIPLocation.mockResolvedValue({ country_code: 'DE' });
    const { React, TestRenderer, CookieConsentBanner } = loadBanner('web');

    let renderer: any;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(CookieConsentBanner));
    });

    const root = renderer.root;
    const textValues = root.findAllByType('Text').map((node: any) => node.children.join(''));
    expect(textValues).toContain('Cookie preferences');
    expect(textValues.some((value: string) => value.includes('EU law (GDPR)'))).toBe(true);

    const privacyLink = root.findAllByType('Text').find((node: any) => node.children.join('') === 'Privacy Policy');
    expect(privacyLink).toBeTruthy();
    await TestRenderer.act(async () => {
      privacyLink.props.onPress();
    });
    expect(mockRouterPush).toHaveBeenCalledWith('/privacy');

    const acceptButton = root.findAllByType('TouchableOpacity').find((node: any) => {
      const label = node.findAllByType('Text')[0]?.children.join('');
      return label === 'Accept';
    });
    expect(acceptButton).toBeTruthy();

    await TestRenderer.act(async () => {
      acceptButton.props.onPress();
    });

    expect((global as any).localStorage.setItem).toHaveBeenCalledWith(
      'hashpass_cookie_consent',
      'granted'
    );
    expect((global as any).window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      { analytics_storage: 'granted' }
    );
    expect(renderer.toJSON()).toBeNull();
  });

  it('stores declined analytics consent for non-GDPR jurisdictions', async () => {
    mockFetchIPLocation.mockResolvedValue({ country_code: 'US' });
    const { React, TestRenderer, CookieConsentBanner } = loadBanner('web');

    let renderer: any;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(React.createElement(CookieConsentBanner));
    });

    const declineButton = renderer.root.findAllByType('TouchableOpacity').find((node: any) => {
      const label = node.findAllByType('Text')[0]?.children.join('');
      return label === 'Decline';
    });
    expect(declineButton).toBeTruthy();

    await TestRenderer.act(async () => {
      declineButton.props.onPress();
    });

    expect((global as any).localStorage.setItem).toHaveBeenCalledWith(
      'hashpass_cookie_consent',
      'denied'
    );
    expect((global as any).window.gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      { analytics_storage: 'denied' }
    );
  });
});
