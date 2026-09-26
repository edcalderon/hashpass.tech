/// <reference types="jest" />

import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('motion/react', () => ({
  motion: { div: 'motion.div' },
}));

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
  Platform: {
    OS: 'web',
    select: (options: Record<string, unknown>) => options.web ?? options.default,
  },
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Pressable: 'Pressable',
  TouchableOpacity: 'TouchableOpacity',
  Appearance: {
    getColorScheme: () => 'light',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn(),
  },
  StyleSheet: {
    create: (styles: any) => styles,
  },
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: { paper: '#ffffff' },
      divider: '#e5e7eb',
      text: {
        primary: '#111111',
        secondary: '#4b5563',
      },
    },
    isDark: false,
  }),
}));

jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const testimonial = {
  text: 'HASHPASS keeps the event flow smooth.',
  wallet: '0x1234567890abcdef1234567890abcdef12345678',
  role: 'Organizer',
};

const interactionProps = ['onClick', 'onPress', 'href'] as const;

const expectTreeToHaveNoClickTarget = (root: ReactTestInstance) => {
  expect(root.findAll((node) => node.type === 'a' || node.type === 'button')).toHaveLength(0);
  expect(
    root.findAll((node) =>
      ['Pressable', 'TouchableOpacity'].includes(String(node.type)),
    ),
  ).toHaveLength(0);
  expect(
    root.findAll((node) =>
      interactionProps.some((prop) => typeof node.props[prop] === 'function' || typeof node.props[prop] === 'string')
    )
  ).toHaveLength(0);
  expect(
    root.findAll(
      (node) =>
        ['button', 'link'].includes(node.props.role) ||
        ['button', 'link'].includes(node.props.accessibilityRole) ||
        (typeof node.props.tabIndex === 'number' && node.props.tabIndex >= 0)
    )
  ).toHaveLength(0);
};

describe('TestimonialsColumn', () => {
  beforeEach(() => {
    jest.spyOn(React, 'useState').mockImplementation(((initial: unknown) => [initial, jest.fn()]) as any);
    jest.spyOn(React, 'useEffect').mockImplementation(() => undefined);
    jest.spyOn(React, 'useMemo').mockImplementation((factory) => factory());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders avatars without relying on out-of-scope styles', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const TestimonialsColumn = require('../../components/TestimonialsColumns').default;

    expect(() =>
      TestimonialsColumn({
        testimonials: [
          testimonial,
        ],
      }),
    ).not.toThrow();
  });

  it('keeps native testimonial cards readable to assistive technology but entirely presentational', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const TestimonialsColumn = require('../../components/TestimonialsColumns').default;
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(<TestimonialsColumn testimonials={[testimonial]} />);
    });

    expectTreeToHaveNoClickTarget(renderer.root);
    const textNodes = renderer.root.findAllByType('Text' as any);
    expect(textNodes).not.toHaveLength(0);
    expect(textNodes.every((node) => node.props.selectable === false)).toBe(true);
    expect(textNodes.map((node) => node.props.children)).toEqual(
      expect.arrayContaining([testimonial.text, '0x1234...5678', testimonial.role])
    );
    expect(
      renderer.root.findAll(
        (node) =>
          node.props.accessibilityElementsHidden === true ||
          node.props['aria-hidden'] === true ||
          node.props.importantForAccessibility === 'no-hide-descendants'
      )
    ).toHaveLength(0);
  });

  it('keeps web testimonial cards inert and non-selectable while preserving section and column motion', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({ matches: false })),
    });
    const TestimonialsColumnWeb = require('../../components/TestimonialsColumns.web').default;
    const TestimonialsWeb = require('../../components/Testimonials.web').default;
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(<TestimonialsColumnWeb testimonials={[testimonial]} duration={15} />);
    });

    expectTreeToHaveNoClickTarget(renderer.root);
    const testimonialText = renderer.root
      .findAllByType('div' as any)
      .find((node) => node.props.children === testimonial.text);
    expect(testimonialText).toBeDefined();
    const card = testimonialText!.parent!;
    const cardClasses = String(card.props.className ?? '');
    expect({
      textSelectionDisabled:
        card.props.style?.userSelect === 'none' || /(?:^|\s)select-none(?:\s|$)/.test(cardClasses),
      pointerInteractionDisabled:
        card.props.style?.pointerEvents === 'none' || /(?:^|\s)pointer-events-none(?:\s|$)/.test(cardClasses),
      clickCursorAbsent:
        card.props.style?.cursor !== 'pointer' && !/(?:^|\s)cursor-pointer(?:\s|$)/.test(cardClasses),
    }).toEqual({
      textSelectionDisabled: true,
      pointerInteractionDisabled: true,
      clickCursorAbsent: true,
    });

    const columnMotion = renderer.root.findByType('motion.div' as any);
    expect(columnMotion.props.animate).toEqual({ translateY: '-50%' });
    expect(columnMotion.props.transition).toMatchObject({ duration: 15, repeat: Infinity, ease: 'linear' });

    const sectionTree = TestimonialsWeb({ locale: 'en' }) as React.ReactElement<any>;
    const sectionRoot = React.Children.toArray(sectionTree.props.children)[0] as React.ReactElement<any>;
    const sectionMotion = React.Children.toArray(sectionRoot.props.children)[0] as React.ReactElement<any>;
    expect(sectionMotion.type).toBe('motion.div');
    expect(sectionMotion.props.whileInView).toEqual({ opacity: 1, y: 0 });
    expect(sectionMotion.props.viewport).toEqual({ once: true });
  });
});
