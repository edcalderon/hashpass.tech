import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

let mockIsDark = false;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: mockIsDark }) }));
jest.mock('react-native-svg', () => ({
  __esModule: true, default: 'Svg', Svg: 'Svg', Path: 'Path', Rect: 'Rect',
  Circle: 'Circle', Line: 'Line', Polyline: 'Polyline', Polygon: 'Polygon', G: 'G',
}));

import CarouselTickPill from '../../components/CarouselTickPill';

let view: ReactTestRenderer;
afterEach(() => { if (view) act(() => view.unmount()); mockIsDark = false; });

const buttons = () => view.root.findAllByType(TouchableOpacity);
// Button order matches render order: [play/pause, ...one per tick, restart].
const playBtn = () => buttons()[0];
const restartBtn = () => buttons()[buttons().length - 1];
const tickBtns = () => buttons().slice(1, -1);

it('renders one tick per slide plus play and restart controls', () => {
  act(() => { view = create(
    <CarouselTickPill count={4} activeIndex={{ value: 0 }} progress={{ value: 0 }} isPlaying />,
  ); });
  expect(tickBtns()).toHaveLength(4);
  expect(buttons()).toHaveLength(6); // play + 4 ticks + restart
});

it('exposes the correct play/pause accessibility label for each state', () => {
  act(() => { view = create(
    <CarouselTickPill count={2} activeIndex={{ value: 0 }} progress={{ value: 0 }} isPlaying />,
  ); });
  expect(playBtn().props.accessibilityLabel).toBe('Pause');

  act(() => { view.update(
    <CarouselTickPill count={2} activeIndex={{ value: 0 }} progress={{ value: 0 }} isPlaying={false} />,
  ); });
  expect(playBtn().props.accessibilityLabel).toBe('Play');
});

it('calls onTogglePlay when the play/pause button is pressed', () => {
  const onTogglePlay = jest.fn();
  act(() => { view = create(
    <CarouselTickPill
      count={2}
      activeIndex={{ value: 0 }}
      progress={{ value: 0 }}
      isPlaying={false}
      onTogglePlay={onTogglePlay}
    />,
  ); });
  act(() => { playBtn().props.onPress(); });
  expect(onTogglePlay).toHaveBeenCalledTimes(1);
});

it('calls onRestart when the restart button is pressed', () => {
  const onRestart = jest.fn();
  act(() => { view = create(
    <CarouselTickPill
      count={3}
      activeIndex={{ value: 1 }}
      progress={{ value: 0.5 }}
      isPlaying
      onRestart={onRestart}
    />,
  ); });
  act(() => { restartBtn().props.onPress(); });
  expect(onRestart).toHaveBeenCalledTimes(1);
});

it('calls onIndexPress with the pressed tick index', () => {
  const onIndexPress = jest.fn();
  act(() => { view = create(
    <CarouselTickPill
      count={3}
      activeIndex={{ value: 0 }}
      progress={{ value: 0 }}
      isPlaying={false}
      onIndexPress={onIndexPress}
    />,
  ); });
  act(() => { tickBtns()[2].props.onPress(); });
  expect(onIndexPress).toHaveBeenCalledWith(2);
});

it('renders without a crash in dark mode too', () => {
  mockIsDark = true;
  act(() => { view = create(
    <CarouselTickPill count={2} activeIndex={{ value: 0 }} progress={{ value: 0 }} isPlaying={false} />,
  ); });
  expect(tickBtns()).toHaveLength(2);
});

it('does not throw when the optional callbacks are omitted', () => {
  act(() => { view = create(
    <CarouselTickPill count={2} activeIndex={{ value: 0 }} progress={{ value: 0 }} isPlaying={false} />,
  ); });
  // onTogglePlay/onRestart go straight to onPress, so RN's TouchableOpacity
  // just receives an undefined handler and no-ops -- matches real usage.
  expect(playBtn().props.onPress).toBeUndefined();
  expect(restartBtn().props.onPress).toBeUndefined();
  expect(() => act(() => { tickBtns()[0].props.onPress(); })).not.toThrow();
});
