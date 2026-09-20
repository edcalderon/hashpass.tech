import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

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
jest.mock('../../components/FeatureFlipCard', () => 'FeatureFlipCard');
jest.mock('../../components/FlipCard', () => 'FlipCard');
jest.mock('../../components/GlowingEffect', () => ({ GlowingEffect: () => null }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons' }));

// The import stays after the mock declarations so the responsive hooks use the
// controlled viewport above.
// eslint-disable-next-line import/first
import Features from '../../components/Features';

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
  expect(cards).toHaveLength(3);
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

it('keeps cards visible before a server-rendered viewport is measured', () => {
  mockWidth = 0;
  act(() => { view = create(<Features {...props} />); });

  const cards = view.root.findAllByType('AnimatedView' as any).filter(node =>
    StyleSheet.flatten(node.props.style)?.flexShrink === 0
  );
  expect(cards.every(card => StyleSheet.flatten(card.props.style)?.width === 272)).toBe(true);
});
