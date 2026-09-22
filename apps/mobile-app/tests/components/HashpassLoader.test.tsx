import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState, type EmitterSubscription } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { Circle, Path } from 'react-native-svg';
import HashpassLoader from '../../components/HashpassLoader';

let mockAnimationLevel = 'full';
jest.mock('../../contexts/AnimationLevelContext', () => ({ useAnimationLevel: () => ({ animationLevel: mockAnimationLevel }) }));
jest.mock('react-native-svg', () => ({
  __esModule: true, default: 'Svg', Svg: 'Svg', Path: 'Path', Circle: 'Circle',
}));

let view: ReactTestRenderer;
let timing: jest.SpyInstance;
let repeat: jest.SpyInstance;
let cancel: jest.SpyInstance;

beforeEach(() => {
  mockAnimationLevel = 'full';
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(false);
  jest.mocked(AccessibilityInfo.addEventListener).mockClear();
  jest.mocked(AppState.addEventListener).mockClear();
  timing = jest.spyOn(Reanimated, 'withTiming');
  repeat = jest.spyOn(Reanimated, 'withRepeat');
  cancel = jest.spyOn(Reanimated, 'cancelAnimation');
});

afterEach(() => {
  act(() => view?.unmount());
  jest.restoreAllMocks();
});

const render = async (props = {}) => {
  await act(async () => { view = create(<HashpassLoader {...props} />); });
};

it('renders the chevron mark and a single accent ring', async () => {
  await render();
  expect(view.root.findAllByType(Path)).toHaveLength(1);
  expect(view.root.findAllByType(Circle)).toHaveLength(1);
});

it('defaults to the logo cyan ring color, and lets a caller override it', async () => {
  await render();
  expect(view.root.findByType(Circle).props.stroke).toBe('#0fe5f0');

  await render({ color: '#ff0000' });
  expect(view.root.findByType(Circle).props.stroke).toBe('#ff0000');
});

it('sizes the frame and scales the chevron mark relative to it', async () => {
  await render({ size: 32 });
  const frame = view.root.findAllByProps({ accessible: false })[0];
  expect(frame.props.style).toEqual(expect.arrayContaining([
    expect.objectContaining({ width: 32, height: 32 }),
  ]));
  expect(view.root.findByType(Path).parent?.props.width).toBeCloseTo(32 * 0.68);
});

it('hides the loader from assistive tech as a single unit', async () => {
  await render();
  const frame = view.root.findAllByProps({ accessible: false })[0];
  expect(frame.props.importantForAccessibility).toBe('no-hide-descendants');
});

it('spins by default and stops when active=false', async () => {
  await render();
  expect(repeat).toHaveBeenCalled();
  expect(timing).toHaveBeenCalledWith(360, expect.objectContaining({ duration: 1300 }));

  repeat.mockClear();
  timing.mockClear();
  await render({ active: false });
  expect(repeat).not.toHaveBeenCalled();
});

it('spins slower under the "reduced" animation level, and not at all under "none"', async () => {
  mockAnimationLevel = 'reduced';
  await render();
  expect(timing).toHaveBeenCalledWith(360, expect.objectContaining({ duration: 2200 }));

  mockAnimationLevel = 'none';
  timing.mockClear();
  await render();
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
});

it('tolerates isReduceMotionEnabled() rejecting by failing static (no spin)', async () => {
  // Same "fail static until the OS preference is known" contract as
  // FeatureIcon: a rejected lookup never resolves systemReduced away from
  // its true default, so the ring stays frozen rather than guessing motion
  // is safe.
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockRejectedValue(new Error('unsupported'));
  await render();
  expect(repeat).not.toHaveBeenCalled();
});

it('freezes when the app backgrounds and cleans up listeners on unmount', async () => {
  const accessibilityRemove = jest.fn();
  const appRemove = jest.fn();
  jest.mocked(AccessibilityInfo.addEventListener).mockReturnValue({ remove: accessibilityRemove } as unknown as EmitterSubscription);
  jest.mocked(AppState.addEventListener).mockReturnValue({ remove: appRemove } as unknown as EmitterSubscription);

  await render();
  timing.mockClear(); cancel.mockClear();

  const listener = jest.mocked(AppState.addEventListener).mock.calls.find(call => call[0] === 'change')?.[1];
  expect(listener).toBeDefined();
  act(() => listener?.('background'));
  expect(cancel).toHaveBeenCalled();

  act(() => view.unmount());
  expect(accessibilityRemove).toHaveBeenCalled();
  expect(appRemove).toHaveBeenCalled();
});
