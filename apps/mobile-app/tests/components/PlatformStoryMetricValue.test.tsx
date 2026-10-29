/** @jest-environment jsdom */

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import NativeMetricValue from '../../components/PlatformStoryMetricValue';
import WebMetricValue from '../../components/PlatformStoryMetricValue.web';

jest.mock('react-native', () => ({
  Text: 'Text',
  Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.web ?? options.default },
  Appearance: {
    getColorScheme: () => 'light',
    addChangeListener: jest.fn(),
    removeChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  AppState: { currentState: 'active', addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
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
jest.mock('@hashpass/ui/tokens', () => ({
  uiTokens: { motion: { entrance: 520 }, type: { label: 14 } },
}));

const originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(global, 'requestAnimationFrame');
const originalCancelAnimationFrame = Object.getOwnPropertyDescriptor(global, 'cancelAnimationFrame');

describe.each([
  ['native', NativeMetricValue],
  ['web', WebMetricValue],
])('%s platform story metric', (_platform, MetricValue) => {
  let renderer: ReactTestRenderer;
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    jest.useFakeTimers({ now: 0 });
    frames = [];
    Object.defineProperty(global, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
      },
    });
    Object.defineProperty(global, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.useRealTimers();
    if (originalRequestAnimationFrame) Object.defineProperty(global, 'requestAnimationFrame', originalRequestAnimationFrame);
    else Reflect.deleteProperty(global, 'requestAnimationFrame');
    if (originalCancelAnimationFrame) Object.defineProperty(global, 'cancelAnimationFrame', originalCancelAnimationFrame);
    else Reflect.deleteProperty(global, 'cancelAnimationFrame');
  });

  const displayedValue = () => renderer.root.findByType('Text' as any).props.children;

  it('counts up after its stagger delay and settles on the accessible total', () => {
    act(() => {
      renderer = create(<MetricValue value="7" animate delay={100} />);
    });

    expect(displayedValue()).toBe('7');
    act(() => { jest.advanceTimersByTime(99); });
    expect(frames).toHaveLength(0);

    act(() => { jest.advanceTimersByTime(1); });
    expect(displayedValue()).toBe('1');

    const runFrameAt = (elapsed: number) => {
      jest.setSystemTime(new Date(100 + elapsed));
      const frame = frames.shift();
      expect(frame).toBeDefined();
      act(() => frame?.(100 + elapsed));
    };

    runFrameAt(260);
    expect(displayedValue()).toBe('6');
    runFrameAt(520);
    expect(displayedValue()).toBe('7');
    expect(renderer.root.findByType('Text' as any).props.accessibilityLabel).toBe('7');
  });

  it.each([
    ['a descriptive value', 'OPEN', true],
    ['a value of one', '1', true],
    ['a static numeric value', '8', false],
  ])('keeps %s unchanged', (_description, value, animate) => {
    act(() => {
      renderer = create(<MetricValue value={value} animate={animate} />);
    });

    expect(displayedValue()).toBe(value);
    expect(frames).toHaveLength(0);
  });

  it('cancels a delayed count when animation is disabled', () => {
    act(() => {
      renderer = create(<MetricValue value="9" animate delay={300} />);
    });
    act(() => { jest.advanceTimersByTime(100); });
    act(() => { renderer.update(<MetricValue value="9" animate={false} delay={300} />); });
    act(() => { jest.advanceTimersByTime(500); });

    expect(displayedValue()).toBe('9');
    expect(frames).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('uses timeout frames when browser animation-frame APIs are unavailable', () => {
    Reflect.deleteProperty(global, 'requestAnimationFrame');
    Reflect.deleteProperty(global, 'cancelAnimationFrame');
    act(() => {
      renderer = create(<MetricValue value="3" animate />);
    });
    act(() => { jest.advanceTimersByTime(600); });

    expect(displayedValue()).toBe('3');
  });
});
