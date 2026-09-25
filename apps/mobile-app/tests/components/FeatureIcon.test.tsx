import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { KeyRound, QrCode, RefreshCcw, ShieldCheck, UsersRound } from 'lucide-react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import FeatureIcon from '../../components/FeatureIcon';

let mockAnimationLevel = 'full';
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: mockAnimationLevel }) }));
jest.mock('react-native-svg', () => ({
  __esModule: true, default: 'Svg', Svg: 'Svg', Path: 'Path', Rect: 'Rect',
  Circle: 'Circle', Line: 'Line', Polyline: 'Polyline', Polygon: 'Polygon', G: 'G',
}));

let view: ReactTestRenderer;
let timing: jest.SpyInstance;
let cancel: jest.SpyInstance;
const originalPlatform = Platform.OS;

beforeEach(() => {
  Platform.OS = 'android';
  mockAnimationLevel = 'full';
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  jest.mocked(AccessibilityInfo.addEventListener).mockClear();
  jest.mocked(AppState.addEventListener).mockClear();
  timing = jest.spyOn(Reanimated, 'withTiming');
  cancel = jest.spyOn(Reanimated, 'cancelAnimation');
});
afterEach(() => { act(() => view?.unmount()); jest.restoreAllMocks(); Platform.OS = originalPlatform; });

const render = async (props = {}) => {
  await act(async () => { view = create(<FeatureIcon name="qr-code-outline" color={uiTokens.feature.violet} active {...props} />); });
};

it.each([
  ['shield-checkmark', ShieldCheck], ['key', KeyRound], ['sync', RefreshCcw],
  ['qr-code-outline', QrCode], ['people-outline', UsersRound],
])('uses distinct SVG artwork for %s inside the same circular frame', async (name, Icon) => {
  await render({ name });
  expect(view.root.findAllByType(Icon as React.ComponentType)).toHaveLength(1);
  const frame = view.root.findByProps({ testID: `feature-icon-${name}` });
  expect(frame.props.style).toEqual(expect.arrayContaining([
    expect.objectContaining({ borderRadius: uiTokens.radius.circle, overflow: 'hidden' }),
    expect.objectContaining({ width: uiTokens.space.hero, height: uiTokens.space.hero }),
  ]));
  expect(frame.props.accessibilityElementsHidden).toBe(true);
});

it('plays bounded native feedback only after interaction', async () => {
  await render({ active: false });
  expect(timing).not.toHaveBeenCalled();
  await act(async () => { view.update(<FeatureIcon name="qr-code-outline" color={uiTokens.feature.violet} active />); });
  expect(timing).toHaveBeenCalledWith(1, expect.objectContaining({ duration: uiTokens.motion.entrance * 2 }));
});

it.each(['reduced', 'none'])('keeps artwork static with the %s app setting', async level => {
  mockAnimationLevel = level;
  await render();
  expect(timing).not.toHaveBeenCalled();
  expect(view.root.findAllByType(QrCode)).toHaveLength(1);
});

it('keeps artwork static with the explicit reduced-motion prop', async () => {
  await render({ reduceMotion: true });
  expect(timing).not.toHaveBeenCalled();
});

it('honors system reduced motion and later preference changes', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  await render();
  expect(timing).not.toHaveBeenCalled();
  const subscriptions = jest.mocked(AccessibilityInfo.addEventListener).mock.calls as unknown as [string, (enabled: boolean) => void][];
  const listener = subscriptions.find(([event]) => event === 'reduceMotionChanged')?.[1];
  expect(listener).toBeDefined();
  act(() => listener?.(false));
  expect(timing).toHaveBeenCalled();
  timing.mockClear(); cancel.mockClear();
  act(() => listener?.(true));
  expect(cancel).toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
});

it('cancels feedback when the app backgrounds and cleans up listeners', async () => {
  const remove = jest.fn();
  jest.mocked(AppState.addEventListener).mockReturnValue({ remove });
  await render();
  timing.mockClear(); cancel.mockClear();
  const listener = jest.mocked(AppState.addEventListener).mock.calls.find(call => call[0] === 'change')?.[1];
  expect(listener).toBeDefined();
  act(() => listener?.('background'));
  expect(cancel).toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  act(() => view.unmount());
  expect(remove).toHaveBeenCalled();
});

it('plays web motion only while the artwork is visible and disconnects its observer', async () => {
  Platform.OS = 'web';
  const originalObserver = global.IntersectionObserver;
  let onIntersection: (entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void;
  const disconnect = jest.fn();
  const observe = jest.fn();
  Object.defineProperty(global, 'IntersectionObserver', { configurable: true, value: jest.fn(callback => {
    onIntersection = callback;
    return { observe, disconnect };
  }) });
  try {
    await act(async () => {
      view = create(<FeatureIcon name="sync" color={uiTokens.feature.green} />, { createNodeMock: () => ({}) });
    });
    expect(observe).toHaveBeenCalledTimes(1);
    expect(timing).not.toHaveBeenCalled();
    act(() => onIntersection([{ isIntersecting: true, intersectionRatio: 1 }]));
    expect(timing).toHaveBeenCalledTimes(1);
    timing.mockClear(); cancel.mockClear();
    act(() => onIntersection([{ isIntersecting: false, intersectionRatio: 0 }]));
    expect(cancel).toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    act(() => view.unmount());
    expect(disconnect).toHaveBeenCalledTimes(1);
  } finally {
    Object.defineProperty(global, 'IntersectionObserver', { configurable: true, value: originalObserver });
  }
});
