import {
  boostPointsForMinutes,
  canBookCoffee,
  COFFEE_DURATIONS,
  meetingDurationMinutes,
  meetingKind,
  meetingTypeLabel,
} from '../../lib/meeting-rules';

describe('meeting rules', () => {
  it('starts a quick stand-up at 5 minutes and adds 5 per 10 boost points up to 30', () => {
    expect(meetingDurationMinutes('speed', 0)).toBe(5);
    expect(meetingDurationMinutes('speed', 9)).toBe(5);
    expect(meetingDurationMinutes('speed', 10)).toBe(10);
    expect(meetingDurationMinutes('speed', 25)).toBe(15);
    expect(meetingDurationMinutes('speed', 49)).toBe(25);
    expect(meetingDurationMinutes('speed', 50)).toBe(30);
    expect(meetingDurationMinutes('speed', 5000)).toBe(30);
    expect(meetingDurationMinutes('speed', -4)).toBe(5);
    expect(meetingDurationMinutes('speed', NaN)).toBe(5);
  });

  it('runs a coffee break 15, 30 or 45 minutes and ignores boost for length', () => {
    expect(COFFEE_DURATIONS).toEqual([15, 30, 45]);
    expect(meetingDurationMinutes('coffee', 50)).toBe(15);
    expect(meetingDurationMinutes('coffee', 0, 30)).toBe(30);
    expect(meetingDurationMinutes('coffee', 0, 44)).toBe(30);
    expect(meetingDurationMinutes('coffee', 0, 90)).toBe(45);
    expect(meetingDurationMinutes('coffee', 0, 1)).toBe(15);
    expect(meetingDurationMinutes('coffee', 0, NaN)).toBe(15);
  });

  it('allows coffee breaks for business and VIP passes only', () => {
    expect(canBookCoffee('business')).toBe(true);
    expect(canBookCoffee('VIP')).toBe(true);
    expect(canBookCoffee('general')).toBe(false);
    expect(canBookCoffee(undefined)).toBe(false);
    expect(canBookCoffee(null)).toBe(false);
  });

  it('treats anything but coffee as a quick stand-up', () => {
    expect(meetingKind('coffee')).toBe('coffee');
    expect(meetingKind('speed')).toBe('speed');
    expect(meetingKind('networking')).toBe('speed');
    expect(meetingKind(undefined)).toBe('speed');
  });

  it('finds the boost points where each stand-up length starts', () => {
    expect(boostPointsForMinutes(5)).toBe(0);
    expect(boostPointsForMinutes(10)).toBe(10);
    expect(boostPointsForMinutes(15)).toBe(20);
    expect(boostPointsForMinutes(30)).toBe(50);
    expect(boostPointsForMinutes(12)).toBe(20);
  });
});

describe('meetingTypeLabel', () => {
  const translate = (key: string) => `t:${key}`;

  it('translates the two current types', () => {
    expect(meetingTypeLabel('speed', translate)).toBe('t:meetingRequestModal.types.speed.title');
    expect(meetingTypeLabel('coffee', translate)).toBe('t:meetingRequestModal.types.coffee.title');
  });

  it('shows legacy free-text types as stored and tolerates empty values', () => {
    expect(meetingTypeLabel('networking', translate)).toBe('networking');
    expect(meetingTypeLabel(undefined, translate)).toBe('');
    expect(meetingTypeLabel(null, translate)).toBe('');
  });
});
