/// <reference types="jest" />
import React from 'react';

jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: {} }) }));
jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../components/ui/DrawerSheet', () => ({
  __esModule: true,
  default: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => (
    <>{children}{footer}</>
  ),
}));

import type { MeetingKind } from '../../lib/meeting-rules';
import MeetingRequestSheet, {
  BOOST_TIERS,
  boostFromPosition,
  boostMax,
  boostTier,
  clampBoost,
  MAX_INTENTIONS,
} from '../../components/MeetingRequestSheet';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

const baseProps = {
  open: true,
  onClose: jest.fn(),
  speakerName: 'Ada',
  message: '',
  onMessageChange: jest.fn(),
  intentions: [] as string[],
  onIntentionsChange: jest.fn(),
  boostAmount: 0,
  onBoostChange: jest.fn(),
  remainingBoost: 100,
  meetingType: 'speed' as MeetingKind,
  onMeetingTypeChange: jest.fn(),
  coffeeMinutes: 15 as 15 | 30 | 45,
  onCoffeeMinutesChange: jest.fn(),
  coffeeAllowed: true,
  onCoffeeLockedPress: jest.fn(),
  submitting: false,
  onSubmit: jest.fn(),
};

const render = (props: Partial<typeof baseProps> = {}) => {
  let renderer: any;
  act(() => {
    renderer = create(<MeetingRequestSheet {...baseProps} {...props} />);
  });
  return renderer;
};

describe('boost helpers', () => {
  it('caps the bar at the balance and at 50 points per request', () => {
    expect(boostMax(0)).toBe(0);
    expect(boostMax(-5)).toBe(0);
    expect(boostMax(NaN)).toBe(0);
    expect(boostMax(7.9)).toBe(7);
    expect(boostMax(500)).toBe(50);
  });

  it('clamps and rounds points into the allowed range', () => {
    expect(clampBoost(-3, 50)).toBe(0);
    expect(clampBoost(12.6, 50)).toBe(13);
    expect(clampBoost(80, 50)).toBe(50);
    expect(clampBoost(NaN, 50)).toBe(0);
  });

  it('maps a pointer position on the bar to whole points', () => {
    expect(boostFromPosition(0, 200, 50)).toBe(0);
    expect(boostFromPosition(100, 200, 50)).toBe(25);
    expect(boostFromPosition(999, 200, 50)).toBe(50);
    expect(boostFromPosition(-20, 200, 50)).toBe(0);
    expect(boostFromPosition(50, 0, 50)).toBe(0);
    expect(boostFromPosition(50, 200, 0)).toBe(0);
  });

  it('reports the priority tier for the points spent', () => {
    expect(boostTier(0)).toBe('standard');
    expect(boostTier(1)).toBe('boosted');
    expect(boostTier(9)).toBe('boosted');
    expect(boostTier(10)).toBe('priority');
    expect(boostTier(25)).toBe('high');
    expect(boostTier(50)).toBe('top');
    expect(BOOST_TIERS.map((tier) => tier.from)).toEqual([...BOOST_TIERS.map((tier) => tier.from)].sort((a, b) => a - b));
  });
});

describe('MeetingRequestSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the 5-minute baseline and standard tier with no boost', () => {
    const renderer = render();
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('meetingRequestModal.boostTier.standard.title');
    expect(json).not.toContain('→');
    expect(renderer.root.findByProps({ testID: 'meeting-boost-length' }).props.children).toBe(
      'meetingRequestModal.minutes:{"minutes":5}',
    );
    expect(renderer.root.findByProps({ testID: 'meeting-boost-bar' }).props.accessibilityValue).toMatchObject({ min: 0, max: 50, now: 0 });
  });

  it('previews the longer meeting and the matching tier as the boost rises', () => {
    const renderer = render({ boostAmount: 25 });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('meetingRequestModal.boostTier.high.title');
    const text = (testID: string) => renderer.root.findByProps({ testID }).props.children;
    expect(text('meeting-boost-length')).toBe(
      'meetingRequestModal.minutes:{"minutes":5} → meetingRequestModal.minutes:{"minutes":15}',
    );
    expect(text('meeting-boost-points')).toBe('meetingRequestModal.boostPoints:{"points":25}');
    expect(text('meeting-boost-tier')).toContain('meetingRequestModal.priorityPoints:{"points":25}');
  });

  it('steps the boost with the +/- buttons and keeps it inside the balance', () => {
    const onBoostChange = jest.fn();
    const renderer = render({ boostAmount: 0, onBoostChange, remainingBoost: 3 });
    expect(renderer.root.findByProps({ testID: 'meeting-boost-bar' }).props.accessibilityValue.max).toBe(3);
    act(() => renderer.root.findByProps({ testID: 'meeting-boost-increase' }).props.onPress());
    expect(onBoostChange).toHaveBeenLastCalledWith(3);
    expect(renderer.root.findByProps({ testID: 'meeting-boost-decrease' }).props.disabled).toBe(true);
  });

  it('adjusts through the accessibility increment and decrement actions', () => {
    const onBoostChange = jest.fn();
    const renderer = render({ boostAmount: 10, onBoostChange });
    const bar = renderer.root.findByProps({ testID: 'meeting-boost-bar' });
    act(() => bar.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(onBoostChange).toHaveBeenLastCalledWith(15);
    act(() => bar.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(onBoostChange).toHaveBeenLastCalledWith(5);
  });

  it('follows a drag across the bar, ignoring the thumb inset', () => {
    const onBoostChange = jest.fn();
    const renderer = render({ boostAmount: 0, onBoostChange });
    const bar = renderer.root.findByProps({ testID: 'meeting-boost-bar' });
    // 228px bar = 200px of travel after the 28px thumb is inset on both ends.
    act(() => bar.props.onLayout({ nativeEvent: { layout: { width: 228 } } }));
    const handlers = renderer.root.findByProps({ testID: 'meeting-boost-bar' }).props;
    act(() => handlers.onPanResponderGrant({ nativeEvent: { locationX: 14 } }));
    expect(onBoostChange).toHaveBeenLastCalledWith(0);
    act(() => handlers.onPanResponderMove({}, { dx: 100 }));
    expect(onBoostChange).toHaveBeenLastCalledWith(25);
    act(() => handlers.onPanResponderMove({}, { dx: 900 }));
    expect(onBoostChange).toHaveBeenLastCalledWith(50);
    act(() => handlers.onPanResponderMove({}, { dx: -900 }));
    expect(onBoostChange).toHaveBeenLastCalledWith(0);
  });

  it('tops a quick stand-up out at 30 minutes at the maximum boost', () => {
    const renderer = render({ boostAmount: 50 });
    expect(renderer.root.findByProps({ testID: 'meeting-boost-length' }).props.children).toBe(
      'meetingRequestModal.minutes:{"minutes":5} → meetingRequestModal.minutes:{"minutes":30}',
    );
  });

  it('offers a quick stand-up and a coffee break and reports the choice', () => {
    const onMeetingTypeChange = jest.fn();
    const renderer = render({ onMeetingTypeChange });
    expect(renderer.root.findByProps({ testID: 'meeting-type-speed' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(renderer.root.findAllByProps({ testID: 'meeting-coffee-lengths' })).toHaveLength(0);
    act(() => renderer.root.findByProps({ testID: 'meeting-type-coffee' }).props.onPress());
    expect(onMeetingTypeChange).toHaveBeenLastCalledWith('coffee');
  });

  it('locks the coffee break for passes that are not business or VIP and opens tickets when tapped', () => {
    const onCoffeeLockedPress = jest.fn();
    const renderer = render({ coffeeAllowed: false, meetingType: 'coffee', onCoffeeLockedPress });
    const coffee = renderer.root.findByProps({ testID: 'meeting-type-coffee' });
    expect(coffee.props.disabled).toBeUndefined();
    expect(coffee.props.accessibilityState).toMatchObject({ selected: false });
    expect(JSON.stringify(renderer.toJSON())).toContain('meetingRequestModal.coffeeLocked');
    act(() => coffee.props.onPress());
    expect(onCoffeeLockedPress).toHaveBeenCalledTimes(1);
    // A stale coffee choice falls back to the stand-up rules, never a locked coffee break.
    expect(renderer.root.findAllByProps({ testID: 'meeting-coffee-lengths' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'meeting-boost-length' }).props.children).toBe(
      'meetingRequestModal.minutes:{"minutes":5}',
    );
  });

  it('lets a coffee break run 15, 30 or 45 minutes and keeps boost off its length', () => {
    const onCoffeeMinutesChange = jest.fn();
    const renderer = render({ meetingType: 'coffee', coffeeMinutes: 30, boostAmount: 50, onCoffeeMinutesChange });
    expect(renderer.root.findByProps({ testID: 'meeting-coffee-30' }).props.accessibilityState).toMatchObject({ selected: true });
    act(() => renderer.root.findByProps({ testID: 'meeting-coffee-45' }).props.onPress());
    expect(onCoffeeMinutesChange).toHaveBeenLastCalledWith(45);
    expect(renderer.root.findByProps({ testID: 'meeting-boost-length' }).props.children).toBe(
      'meetingRequestModal.minutes:{"minutes":30}',
    );
    expect(renderer.root.findByProps({ testID: 'meeting-boost-note' }).props.children).toBe(
      'meetingRequestModal.boostNote.coffee',
    );
  });

  it('hides the boost card when the pass has no boost points left', () => {
    const renderer = render({ remainingBoost: 0 });
    expect(renderer.root.findAllByProps({ testID: 'meeting-boost' })).toHaveLength(0);
  });

  it('toggles purposes and stops at the maximum', () => {
    const onIntentionsChange = jest.fn();
    const renderer = render({ onIntentionsChange });
    act(() => renderer.root.findByProps({ testID: 'meeting-intention-coffee' }).props.onPress());
    expect(onIntentionsChange).toHaveBeenLastCalledWith(['coffee']);

    const full = ['coffee', 'pitch', 'advice'];
    expect(full).toHaveLength(MAX_INTENTIONS);
    const limited = render({ intentions: full, onIntentionsChange });
    const locked = limited.root.findByProps({ testID: 'meeting-intention-networking' });
    expect(locked.props.disabled).toBe(true);
    const chosen = limited.root.findByProps({ testID: 'meeting-intention-coffee' });
    act(() => chosen.props.onPress());
    expect(onIntentionsChange).toHaveBeenLastCalledWith(['pitch', 'advice']);
  });

  it('sends the request from the footer button and disables it while sending', () => {
    const onSubmit = jest.fn();
    const renderer = render({ onSubmit });
    act(() => renderer.root.findByProps({ testID: 'meeting-send-request' }).props.onPress());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const busy = render({ submitting: true });
    expect(busy.root.findByProps({ testID: 'meeting-send-request' }).props.disabled).toBe(true);
  });
});
