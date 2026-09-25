import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform, StyleSheet } from 'react-native';

let mockWidth = 390;

jest.mock('react-native', () => {
  const flatten = (value: unknown): Record<string, unknown> => {
    if (!value) return {};
    if (Array.isArray(value)) return value.reduce((result, item) => ({ ...result, ...flatten(item) }), {});
    return typeof value === 'object' ? value as Record<string, unknown> : {};
  };
  return {
    AccessibilityInfo: {
      isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Appearance: {
      getColorScheme: () => 'light',
      addChangeListener: jest.fn(),
      removeChangeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
    },
    Dimensions: {
      get: jest.fn(() => ({ width: mockWidth, height: 844, scale: 1, fontScale: 1 })),
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      removeEventListener: jest.fn(),
    },
    I18nManager: { isRTL: false },
    PixelRatio: { get: () => 1 },
    Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default },
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    TouchableOpacity: 'TouchableOpacity',
    StyleSheet: { create: (styles: unknown) => styles, flatten },
    useWindowDimensions: () => ({ width: mockWidth, height: 844, scale: 1, fontScale: 1 }),
  };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'AnimatedView' },
  useSharedValue: (value: unknown) => ({ value }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }),
}));
// Features renders the verified baseline metrics synchronously and only
// patches them in from a live /api/status call -- these tests exercise
// layout/interaction, not the network path, so a resolved no-op is enough.
jest.mock('@/lib/api-client', () => ({
  apiClient: { request: () => Promise.resolve({ success: false, error: 'not mocked', data: null }) },
}));
jest.mock('../../components/FeatureFlipCard', () => 'FeatureFlipCard');
jest.mock('../../components/FeatureIcon', () => 'FeatureIcon');
jest.mock('../../components/LandingBadge', () => 'LandingBadge');
jest.mock('../../components/FlipCard', () => 'FlipCard');
jest.mock('../../components/GlowingEffect', () => ({ GlowingEffect: () => null }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons' }));

// The import stays after the mock declarations so the responsive hooks use the
// controlled viewport above.
// eslint-disable-next-line import/first
import Features, { mergeLiveSystemMetrics, PUBLIC_METRICS_BASELINE } from '../../components/Features';

const props = {
  styles: { featuresContainer: {}, featuresGrid: {} },
  featuresAnimatedStyle: {},
  feature1Style: {},
  feature2Style: {},
  feature3Style: {},
  isDark: false,
};

let view: ReactTestRenderer;

afterEach(() => {
  act(() => view?.unmount());
  mockWidth = 390;
  Platform.OS = 'web';
});

it('stacks full-width flip cards on phones without a horizontal scroller', () => {
  act(() => { view = create(<Features {...props} />); });

  expect(view.root.findAllByType('ScrollView' as any)).toHaveLength(0);
  const grid = view.root.findAllByType('View' as any).find(node => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.gap === 16 && style?.paddingHorizontal === 16;
  });
  expect(StyleSheet.flatten(grid?.props.style)).toMatchObject({
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'center',
  });

  const cards = view.root.findAllByType('AnimatedView' as any).filter(node =>
    StyleSheet.flatten(node.props.style)?.flexShrink === 0
  );
  expect(cards).toHaveLength(10);
  expect(cards.every(card => StyleSheet.flatten(card.props.style)?.width === 342)).toBe(true);
});

it('uses a wrapping three-card row at desktop width', () => {
  mockWidth = 1200;
  act(() => { view = create(<Features {...props} />); });

  const grid = view.root.findAllByType('View' as any).find(node => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.gap === 16 && style?.paddingHorizontal === 16;
  });
  expect(StyleSheet.flatten(grid?.props.style)).toMatchObject({
    flexDirection: 'row',
    flexWrap: 'wrap',
  });

  const cards = view.root.findAllByType('AnimatedView' as any).filter(node =>
    StyleSheet.flatten(node.props.style)?.flexShrink === 0
  );
  expect(cards.every(card => StyleSheet.flatten(card.props.style)?.width === 280)).toBe(true);
});

it('pauses the feature marquee while the selected web card is open', () => {
  act(() => { view = create(<Features {...props} />); });

  const card = view.root.findAllByType('FeatureFlipCard' as any)[2];
  const originalRaf = global.requestAnimationFrame;
  Object.defineProperty(global, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => callback(0),
  });

  act(() => { card.props.onFlipChange(true, {}); });

  const viewport = view.root.findAllByType('div' as any).find(node =>
    String(node.props.className).includes('hashpass-feature-viewport'),
  );
  if (!viewport) throw new Error('Feature marquee viewport is missing');
  expect(viewport.props.className).toContain('has-active-card');
  expect(view.root.findAllByType('FeatureFlipCard' as any)[2].props.isFlipped).toBe(true);
  Object.defineProperty(global, 'requestAnimationFrame', {
    configurable: true,
    value: originalRaf,
  });
});

it('centers an expanded card instantly when motion is reduced', () => {
  const scrollTo = jest.fn();
  const originalRaf = global.requestAnimationFrame;
  Object.defineProperty(global, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => callback(0),
  });

  try {
    act(() => {
      view = create(<Features {...props} reduceMotion />, {
        createNodeMock: (element) => {
          const hostElement = element as { type: unknown; props: { className?: unknown } };
          if (
            hostElement.type === 'div'
            && String(hostElement.props.className).includes('hashpass-feature-viewport')
          ) {
            return {
              scrollLeft: 60,
              clientWidth: 300,
              getBoundingClientRect: () => ({ left: 10 }),
              scrollTo,
            };
          }
          return {};
        },
      });
    });

    const card = view.root.findAllByType('FeatureFlipCard' as any)[2];
    act(() => {
      card.props.onFlipChange(true, {
        getBoundingClientRect: () => ({ left: 120, width: 240 }),
      });
    });

    expect(scrollTo).toHaveBeenCalledWith({ left: 140, behavior: 'auto' });
    const viewport = view.root.findAllByType('div' as any).find(node =>
      String(node.props.className).includes('hashpass-feature-viewport'),
    );
    expect(viewport?.props.className).toContain('has-reduced-motion');
    expect(card.props.reduceMotion).toBe(true);
  } finally {
    Object.defineProperty(global, 'requestAnimationFrame', {
      configurable: true,
      value: originalRaf,
    });
  }
});

it('uses the shared circular artwork for every native feature and animates only the opened detail', () => {
  Platform.OS = 'android';
  act(() => { view = create(<Features {...props} reduceMotion />); });
  const cards = view.root.findAllByType('FlipCard' as any);
  expect(cards).toHaveLength(5);
  const detailIcon = (index: number) => {
    let rendered: ReactTestRenderer;
    act(() => { rendered = create(cards[index].props.FlippedContent); });
    const iconProps = rendered!.root.findByType('FeatureIcon' as any).props;
    act(() => rendered!.unmount());
    return iconProps;
  };
  expect(cards.map((_, index) => detailIcon(index).name)).toEqual(['shield-checkmark', 'key', 'sync', 'qr-code-outline', 'people-outline']);
  expect(detailIcon(3)).toMatchObject({ compact: true, reduceMotion: true, active: false, visible: false });
  act(() => view.root.findAllByType('Pressable' as any)[3].props.onPress());
  expect(detailIcon(3)).toMatchObject({ active: true, visible: true });
});

it('keeps cards visible before a server-rendered viewport is measured', () => {
  mockWidth = 0;
  act(() => { view = create(<Features {...props} />); });

  const cards = view.root.findAllByType('AnimatedView' as any).filter(node =>
    StyleSheet.flatten(node.props.style)?.flexShrink === 0
  );
  expect(cards.every(card => StyleSheet.flatten(card.props.style)?.width === 272)).toBe(true);
});

it('uses the verified production snapshot until live metrics are available', () => {
  expect(PUBLIC_METRICS_BASELINE).toEqual({ passes: 2, agenda: 0, speakers: 61, bookings: 4 });
  expect(mergeLiveSystemMetrics(PUBLIC_METRICS_BASELINE, null)).toEqual(PUBLIC_METRICS_BASELINE);
});

it('preserves a known metric when a live health check is inaccessible or incomplete', () => {
  expect(mergeLiveSystemMetrics(PUBLIC_METRICS_BASELINE, {
    passes: { count: 18, accessible: true },
    agenda: { itemCount: 7 },
    speakers: { count: 0, accessible: false },
    bookings: {},
  })).toEqual({ passes: 18, agenda: 7, speakers: 61, bookings: 4 });
});
