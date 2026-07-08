/// <reference types="jest" />

const mockRouterPush = jest.fn();
const mockImpactAsync = jest.fn();
const mockSetTheme = jest.fn();
const mockSetLocale = jest.fn();
const mockSetAnimationLevel = jest.fn();

type MockRenderOptions = {
  width?: number;
  pathname?: string;
  platform?: 'android' | 'ios' | 'web';
  scrollY?: { value: number };
  hideAfterScrollY?: number;
};

const mockColors = {
  primary: '#d93025',
  primaryContrastText: '#ffffff',
  secondary: '#1f2937',
  secondaryContrastText: '#ffffff',
  surface: '#f5f5f5',
  divider: '#e5e7eb',
  background: {
    default: '#fafafa',
    paper: '#ffffff',
    primary: '#fafafa',
  },
  success: {
    main: '#10b981',
  },
  warning: {
    main: '#f59e0b',
  },
  error: {
    main: '#ef4444',
  },
  text: {
    primary: '#111827',
    secondary: '#4b5563',
  },
};

const loadQuickSettingsPanel = (options: MockRenderOptions = {}) => {
  const {
    width = 1024,
    pathname = '/dashboard/explore',
    platform = 'web',
    scrollY,
    hideAfterScrollY = 30,
  } = options;

  let renderer: any;
  let actFn: any;

  jest.isolateModules(() => {
    jest.resetModules();

    const MockAnimatedValue = class {
      value: number;

      constructor(value: number) {
        this.value = value;
      }

      setValue(nextValue: number) {
        this.value = nextValue;
      }

      interpolate({ outputRange }: { outputRange: [any, any] }) {
        return this.value >= 0.5 ? outputRange[1] : outputRange[0];
      }
    };

    const mockAnimation = (value: { setValue?: (nextValue: number) => void }, config: { toValue?: number }) => ({
      start: (callback?: () => void) => {
        if (typeof value.setValue === 'function' && typeof config.toValue === 'number') {
          value.setValue(config.toValue);
        }

        if (callback) {
          callback();
        }
      },
    });

    jest.doMock('react-native', () => ({
      ActivityIndicator: 'ActivityIndicator',
      Alert: {
        alert: jest.fn(),
      },
      Animated: {
        View: 'Animated.View',
        Text: 'Animated.Text',
        Value: MockAnimatedValue,
        spring: (value: any, config: any) => mockAnimation(value, config),
        timing: (value: any, config: any) => mockAnimation(value, config),
        parallel: (animations: Array<{ start?: (callback?: () => void) => void }>) => ({
          start: (callback?: () => void) => {
            animations.forEach((animation) => animation.start?.());
            if (callback) {
              callback();
            }
          },
        }),
      },
      AccessibilityInfo: {
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
      },
      Appearance: {
        getColorScheme: () => 'light',
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addChangeListener: jest.fn(),
        removeChangeListener: jest.fn(),
      },
      AppState: {
        currentState: 'active',
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        removeEventListener: jest.fn(),
      },
      Dimensions: {
        get: jest.fn(() => ({ width, height: 800, scale: 1, fontScale: 1 })),
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        removeEventListener: jest.fn(),
      },
      FlatList: 'FlatList',
      Image: 'Image',
      ImageBackground: 'ImageBackground',
      Easing: {
        cubic: 'cubic',
        out: (value: unknown) => value,
        in: (value: unknown) => value,
      },
      I18nManager: {
        isRTL: false,
      },
      Linking: {
        openURL: jest.fn(),
      },
      Platform: {
        OS: platform,
        select: (options: Record<string, unknown>) => options[platform] ?? options.default,
      },
      PixelRatio: {
        get: () => 1,
      },
      Pressable: 'Pressable',
      SafeAreaView: 'SafeAreaView',
      ScrollView: 'ScrollView',
      StatusBar: 'StatusBar',
      StyleSheet: {
        create: (styles: any) => styles,
        flatten: (style: any) => style,
      },
      Switch: 'Switch',
      Text: 'Text',
      TextInput: 'TextInput',
      TouchableOpacity: 'TouchableOpacity',
      TouchableWithoutFeedback: 'TouchableWithoutFeedback',
      UIManager: {
        getViewManagerConfig: () => undefined,
      },
      View: 'View',
      useColorScheme: () => 'light',
      useWindowDimensions: () => ({ width, height: 800, scale: 1, fontScale: 1 }),
    }));

    jest.doMock('react-native-reanimated', () => ({
      __esModule: true,
      default: { View: 'Reanimated.View' },
      useAnimatedStyle: (factory: () => any) => factory(),
      withTiming: (value: any) => value,
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

    jest.doMock('expo-haptics', () => ({
      __esModule: true,
      ImpactFeedbackStyle: {
        Light: 'Light',
      },
      impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
    }));

    jest.doMock('expo-router', () => ({
      usePathname: () => pathname,
      useRouter: () => ({
        push: mockRouterPush,
      }),
    }));

    jest.doMock('../../hooks/useTheme', () => ({
      useTheme: () => ({
        theme: 'light',
        setTheme: mockSetTheme,
        colors: mockColors,
        isDark: false,
      }),
    }));

    jest.doMock('../../providers/LanguageProvider', () => ({
      useLanguage: () => ({
        locale: 'en',
        setLocale: mockSetLocale,
      }),
    }));

    jest.doMock('../../contexts/AnimationLevelContext', () => ({
      useAnimationLevel: () => ({
        animationLevel: 'full',
        setAnimationLevel: mockSetAnimationLevel,
      }),
    }));

    jest.doMock('../../i18n/i18n', () => ({
      getAvailableLocales: () => [
        { code: 'en', name: 'english' },
        { code: 'pt', name: 'portuguese' },
      ],
      useTranslation: () => ({
        t: (key: string) => {
          if (key.startsWith('languages.')) {
            return key.split('.').pop();
          }

          return undefined;
        },
      }),
    }));

    jest.doMock('../../lib/utils', () => ({
      createShadowStyle: () => ({}),
    }));

    jest.doMock('../../components/icons/SettingsIcons', () => ({
      SettingsIcon: 'SettingsIcon',
      LogInIcon: 'LogInIcon',
      MoonIcon: 'MoonIcon',
      SunIcon: 'SunIcon',
      AutoIcon: 'AutoIcon',
      ZapIcon: 'ZapIcon',
      SliderIcon: 'SliderIcon',
      PauseIcon: 'PauseIcon',
      CheckIcon: 'CheckIcon',
      getFlagEmoji: (code: string) => (code.toLowerCase() === 'pt' ? '🇧🇷' : '🇺🇸'),
    }));

    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const QuickSettingsPanel = require('../../components/QuickSettingsPanel').default as any;

    actFn = TestRenderer.act;
    actFn(() => {
      renderer = TestRenderer.create(
        React.createElement(QuickSettingsPanel, {
          ...(scrollY ? { scrollY } : {}),
          hideAfterScrollY,
        })
      );
    });
  });

  return { renderer, act: actFn };
};

describe('QuickSettingsPanel', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockImpactAsync.mockReset();
    mockSetTheme.mockReset();
    mockSetLocale.mockReset();
    mockSetAnimationLevel.mockReset();
  });

  it('opens the panel and keeps the sign-in shortcut on non-auth pages', async () => {
    const { renderer, act } = loadQuickSettingsPanel({
      width: 1024,
      pathname: '/dashboard/explore',
      platform: 'web',
    });

    const root = renderer.root;
    expect(root.findAllByProps({ accessibilityLabel: 'Sign in' }).length).toBeGreaterThan(0);

    const signInButton = root.findByProps({ accessibilityLabel: 'Sign in' });
    await act(async () => {
      signInButton.props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/(shared)/auth');

    const settingsButton = root.findByProps({ accessibilityLabel: 'Quick Settings' });
    await act(async () => {
      settingsButton.props.onPress();
    });

    expect(mockImpactAsync).toHaveBeenCalledWith('Light');
    expect(root.findAllByType('Text').some((node: any) => node.children.join('') === 'Appearance')).toBe(true);

    const pressLabel = async (label: string) => {
      const textNode = root.findAllByType('Text').find((node: any) => node.children.join('') === label);
      expect(textNode).toBeTruthy();
      await act(async () => {
        textNode.parent.props.onPress();
      });
    };

    await pressLabel('Dark');
    expect(mockSetTheme).toHaveBeenCalledWith('dark');

    await pressLabel('portuguese');
    expect(mockSetLocale).toHaveBeenCalledWith('pt');

    await pressLabel('Off');
    expect(mockSetAnimationLevel).toHaveBeenCalledWith('none');

    const backdrop = root.findByType('TouchableWithoutFeedback');
    await act(async () => {
      backdrop.props.onPress();
    });

    expect(root.findAllByType('Text').some((node: any) => node.children.join('') === 'Appearance')).toBe(false);
  });

  it('hides the sign-in shortcut on the auth page and respects scroll-based visibility', () => {
    const { renderer } = loadQuickSettingsPanel({
      width: 375,
      pathname: '/(shared)/auth',
      platform: 'android',
      scrollY: { value: 80 },
      hideAfterScrollY: 30,
    });

    const root = renderer.root;
    expect(root.findAllByProps({ accessibilityLabel: 'Sign in' })).toHaveLength(0);

    const panel = root.findByType('Reanimated.View');
    expect(panel.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          opacity: 0,
          pointerEvents: 'none',
        }),
        expect.objectContaining({
          top: 56,
          right: 12,
        }),
      ])
    );
  });
});
