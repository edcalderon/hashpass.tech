/** @jest-environment jsdom */
/// <reference types="jest" />

import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState } from 'react-native';
import type { PlatformStoryCard } from '../../components/types/PlatformStory.types';

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default },
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
  },
  AccessibilityInfo: {
    isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Dimensions: {
    get: jest.fn(() => ({ width: 1024, height: 768, scale: 1, fontScale: 1 })),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  PixelRatio: { get: () => 1 },
  I18nManager: { isRTL: false },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

jest.mock('@hashpass/ui/primitives', () => ({ Surface: 'Surface' }));
jest.mock('../../components/FeatureIcon', () => 'FeatureIcon');
jest.mock('motion/react', () => ({
  LazyMotion: 'LazyMotion',
  domAnimation: {},
  m: { div: 'motion.div' },
}));
jest.mock('../../contexts/AnimationLevelContext', () => ({
  useAnimationLevel: () => ({ animationLevel: 'full' }),
}));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: { paper: '#ffffff' },
      divider: '#e5e7eb',
      text: { primary: '#111111', secondary: '#4b5563' },
    },
  }),
}));

const stories: PlatformStoryCard[] = [
  {
    id: 'lifecycle',
    icon: 'people-outline',
    accentColor: '#06b6d4',
    metricValue: '1',
    metric: 'ACCOUNT · FULL LIFECYCLE',
    eyebrow: 'ONE CONNECTED HOME',
    title: 'One account, the whole lifecycle',
    description: 'Bring members, events and the people around them into one connected place.',
  },
  {
    id: 'membership',
    icon: 'key',
    accentColor: '#22c55e',
    metricValue: '4',
    metric: 'MEMBERSHIP ACTIONS',
    eyebrow: 'MEMBERSHIP & ACCESS',
    title: 'A clear way to join',
    description: 'Invitations, approvals, renewals and roles help organizers welcome members.',
  },
  {
    id: 'eventTools',
    icon: 'calendar-days',
    accentColor: '#f59e0b',
    metricValue: '4',
    metric: 'EVENT BUILDING BLOCKS',
    eyebrow: 'EVENTS & PROGRAMMES',
    title: 'Everything around the gathering',
    description: 'Keep passes, agendas, speakers and meetings in one place.',
  },
  {
    id: 'sharingTools',
    icon: 'qr-code-outline',
    accentColor: '#8b5cf6',
    metricValue: '2',
    metric: 'SHAREABLE TOOLS',
    eyebrow: 'SHAREABLE TOOLS',
    title: 'Take the event beyond the room',
    description: 'Trackable QR links and personal event artwork support sharing.',
  },
  {
    id: 'surfaces',
    icon: 'monitor-smartphone',
    accentColor: '#06b6d4',
    metricValue: '2',
    metric: 'PLATFORMS · WEB + MOBILE',
    eyebrow: 'BUILT FOR THE WAY PEOPLE CONNECT',
    title: 'Meet members where they are',
    description: 'HASHPASS brings community tools to the web and mobile.',
  },
  {
    id: 'languages',
    icon: 'globe-2',
    accentColor: '#22c55e',
    metricValue: '7',
    metric: 'APP LANGUAGES',
    eyebrow: 'LOCALIZED EXPERIENCE',
    title: 'Speak to more communities',
    description: 'Use HASHPASS in English, Spanish, Korean, French, Portuguese, German or Estonian.',
  },
  {
    id: 'truthful',
    icon: 'shield-checkmark',
    accentColor: '#22c55e',
    metricValue: 'TRUE',
    metric: 'BY DEFAULT',
    eyebrow: 'TRUTHFUL BY DEFAULT',
    title: 'Start with what is real',
    description: 'Event and account data stay canonical. Listings, balances and testimonials are never invented.',
  },
  {
    id: 'private',
    icon: 'key',
    accentColor: '#8b5cf6',
    metricValue: 'PRIVATE',
    metric: 'BY DESIGN',
    eyebrow: 'PRIVATE BY DESIGN',
    title: 'Respect each community',
    description: 'Privacy is a core principle in how we build HASHPASS.',
  },
  {
    id: 'open',
    icon: 'people-outline',
    accentColor: '#06b6d4',
    metricValue: 'OPEN',
    metric: 'TO EVERYONE',
    eyebrow: 'OPEN TO EVERYONE',
    title: 'Make it easy to join',
    description: 'Every community deserves infrastructure that helps people take part.',
  },
];

const expectNoInteractiveTargets = (root: ReactTestInstance) => {
  expect(root.findAll((node) => ['a', 'button'].includes(String(node.type)))).toHaveLength(0);
  expect(root.findAll((node) => ['onClick', 'onPress', 'href'].some((prop) => prop in node.props))).toHaveLength(0);
};

describe('platform story cards', () => {
  it('renders the truthful capability cards with the shared surface and feature icon', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const PlatformStoryCards = require('../../components/PlatformStoryCards').default;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(<PlatformStoryCards stories={[...stories]} />);
      await Promise.resolve();
    });

    const text = renderer.root.findAllByType('Text' as any).map((node) => node.props.children);
    expect(text).toEqual(expect.arrayContaining(stories.flatMap(({ eyebrow, title, description }) => [eyebrow, title, description])));
    expect(renderer.root.findAllByType('Surface' as any)).toHaveLength(9);
    expect(renderer.root.findAllByType('FeatureIcon' as any)).toHaveLength(9);
    expect(renderer.root.findAllByType('Image' as any)).toHaveLength(0);
    expectNoInteractiveTargets(renderer.root);
    act(() => renderer.unmount());
  });

  it('updates native motion for accessibility and foreground changes, then removes listeners', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const PlatformStoryCards = require('../../components/PlatformStoryCards').default;
    const preferenceRemove = jest.fn();
    const appRemove = jest.fn();
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockClear();
    jest.mocked(AccessibilityInfo.addEventListener).mockClear();
    jest.mocked(AppState.addEventListener).mockClear();
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
    jest.mocked(AccessibilityInfo.addEventListener).mockReturnValue({ remove: preferenceRemove } as never);
    jest.mocked(AppState.addEventListener).mockReturnValue({ remove: appRemove } as never);

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<PlatformStoryCards stories={[...stories]} />);
      await Promise.resolve();
    });

    const icons = () => renderer.root.findAllByType('FeatureIcon' as any);
    expect(icons()[0].props.active).toBe(true);

    const preferenceCalls = jest.mocked(AccessibilityInfo.addEventListener).mock.calls as unknown as
      [string, (enabled: boolean) => void][];
    const preferenceListener = preferenceCalls
      .filter(([event]) => event === 'reduceMotionChanged').at(-1)?.[1];
    const appStateListener = jest.mocked(AppState.addEventListener).mock.calls
      .filter(([event]) => event === 'change').at(-1)?.[1] as ((state: string) => void) | undefined;

    act(() => preferenceListener?.(true));
    expect(icons()[0].props.active).toBe(false);
    act(() => preferenceListener?.(false));
    expect(icons()[0].props.active).toBe(true);
    act(() => appStateListener?.('background'));
    expect(icons()[0].props.active).toBe(false);
    act(() => appStateListener?.('active'));
    expect(icons()[0].props.active).toBe(true);

    act(() => renderer.unmount());
    expect(preferenceRemove).toHaveBeenCalledTimes(1);
    expect(appRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps the web layout responsive and presentational', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const PlatformStoryCardsWeb = require('../../components/PlatformStoryCards.web').default;
    let renderer!: ReactTestRenderer;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    act(() => {
      renderer = create(<PlatformStoryCardsWeb stories={[...stories]} />);
    });

    const storyCards = renderer.root.findAllByType('motion.div' as any)
      .filter((node) => typeof node.props.onViewportEnter === 'function');
    expect(storyCards.length).toBeGreaterThan(0);
    const metricValues = () => renderer.root.findAll((node) =>
      typeof node.type === 'function' && node.type.name === 'PlatformStoryMetricValue',
    );
    expect(metricValues()[0].props.animate).toBe(false);
    act(() => storyCards[0].props.onViewportEnter());
    expect(metricValues().some((node) => node.props.animate)).toBe(true);

    const grid = renderer.root.findAllByType('div' as any).find((node) =>
      String(node.props.className).includes('max-h-[740px]'),
    );
    expect(grid).toBeDefined();
    expect(renderer.root.findAllByType('Surface' as any)).toHaveLength(54);
    expect(renderer.root.findAllByType('FeatureIcon' as any)).toHaveLength(54);
    const streams = renderer.root.findAllByType('motion.div' as any).filter((node) => node.props.animate);
    expect(streams.map((stream) => stream.props.transition.duration)).toEqual([42, 18, 21, 18, 21, 19]);
    expect(streams.every((stream) => stream.props.transition.repeat === Infinity)).toBe(true);
    expectNoInteractiveTargets(renderer.root);
  });

  it('keeps the card stream still when system reduced motion is enabled', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: jest.fn(() => ({
        matches: true,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const PlatformStoryCardsWeb = require('../../components/PlatformStoryCards.web').default;
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(<PlatformStoryCardsWeb stories={[...stories]} />);
    });

    const streams = renderer.root.findAllByType('motion.div' as any).filter((node) => node.props.animate);
    expect(streams.every((stream) => JSON.stringify(stream.props.animate) === JSON.stringify({ y: 0 }))).toBe(true);
    expect(streams.every((stream) => JSON.stringify(stream.props.transition) === JSON.stringify({ duration: 0 }))).toBe(true);
    expect(renderer.root.findAllByType('Surface' as any)).toHaveLength(27);
  });
});
