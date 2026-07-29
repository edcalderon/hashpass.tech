/// <reference types="jest" />

import {
  buildWalletPasses,
  countWalletPasses,
  filterWalletPasses,
  getPassTypeAccent,
} from '../../lib/pass-wallet';
import type { PassInfo } from '../../lib/pass-system';

// Real event ids from packages/config/src/events.ts, so the date-derived
// timeline classification is exercised against the same config the app reads.
// chile2026 ends 2026-08-07, colombia2026 ends 2026-11-06, bsl2025 ended
// 2025-11-14.
const AUGUST_1_2026 = Date.parse('2026-08-01T12:00:00Z');
const AUGUST_6_2026 = Date.parse('2026-08-06T12:00:00Z');

const makePass = (overrides: Partial<PassInfo> = {}): PassInfo => ({
  pass_id: 'pass-1',
  pass_type: 'general',
  status: 'active',
  pass_number: 'BSL-GENERAL-0001',
  max_requests: 10,
  used_requests: 0,
  remaining_requests: 10,
  max_boost: 100,
  used_boost: 0,
  remaining_boost: 100,
  access_features: [],
  special_perks: [],
  ...overrides,
});

describe('buildWalletPasses', () => {
  it('classifies passes against the event calendar, not the pass status', () => {
    const [chile] = buildWalletPasses(
      [makePass({ pass_id: 'a', event_id: 'chile2026' })],
      AUGUST_1_2026
    );

    expect(chile.timeline).toBe('upcoming');
    expect(chile.eventName).toBe('BSL Chile 2026');
    expect(chile.eventLocation).toBe('Santiago, Chile');
    expect(chile.isArchived).toBe(false);
  });

  it('marks an event as live only while it is actually running', () => {
    const during = buildWalletPasses(
      [makePass({ pass_id: 'a', event_id: 'chile2026' })],
      AUGUST_6_2026
    );
    expect(during[0].timeline).toBe('live');
  });

  it('files an event whose end date has passed under past', () => {
    const [archive] = buildWalletPasses(
      [makePass({ pass_id: 'a', event_id: 'bsl2025' })],
      AUGUST_1_2026
    );
    expect(archive.timeline).toBe('past');
  });

  it('keeps a cancelled pass on its real calendar position but flags it archived', () => {
    // A cancelled pass for a future event is still a future-event pass; it
    // just isn't usable. Folding status into the timeline would hide it from
    // the "Upcoming" filter where the user expects to find it.
    const [pass] = buildWalletPasses(
      [makePass({ pass_id: 'a', event_id: 'colombia2026', status: 'cancelled' })],
      AUGUST_1_2026
    );

    expect(pass.timeline).toBe('upcoming');
    expect(pass.isArchived).toBe(true);
  });

  it('treats an event with no configured dates as upcoming rather than past', () => {
    const [pass] = buildWalletPasses(
      [makePass({ pass_id: 'a', event_id: 'not-a-configured-event' })],
      AUGUST_1_2026
    );
    expect(pass.timeline).toBe('upcoming');
  });

  it('orders live first, then soonest upcoming, then most recent past', () => {
    const ordered = buildWalletPasses(
      [
        makePass({ pass_id: 'archive', event_id: 'bsl2025' }),
        makePass({ pass_id: 'colombia', event_id: 'colombia2026' }),
        makePass({ pass_id: 'chile', event_id: 'chile2026' }),
      ],
      AUGUST_6_2026
    );

    expect(ordered.map((pass) => pass.pass_id)).toEqual(['chile', 'colombia', 'archive']);
  });

  it('falls back to an event-derived key when the pass row has no real id', () => {
    // getUserPassInfoFromCounts hands back the literal 'unknown' pass_id;
    // using it as a list key would collide across events.
    const [pass] = buildWalletPasses(
      [makePass({ pass_id: 'unknown', event_id: 'chile2026' })],
      AUGUST_1_2026
    );
    expect(pass.id).toBe('chile2026-general');
  });
});

describe('filterWalletPasses', () => {
  const passes = buildWalletPasses(
    [
      makePass({ pass_id: 'chile', event_id: 'chile2026', pass_type: 'general' }),
      makePass({ pass_id: 'colombia', event_id: 'colombia2026', pass_type: 'vip' }),
      makePass({ pass_id: 'archive', event_id: 'bsl2025', pass_type: 'general' }),
    ],
    AUGUST_1_2026
  );

  it('returns everything when no filters are set', () => {
    expect(filterWalletPasses(passes)).toHaveLength(3);
  });

  it('filters by timeline', () => {
    expect(filterWalletPasses(passes, { timeline: 'past' }).map((p) => p.pass_id)).toEqual(['archive']);
  });

  it('filters by pass type', () => {
    expect(filterWalletPasses(passes, { passType: 'vip' }).map((p) => p.pass_id)).toEqual(['colombia']);
  });

  it('searches across event name, location and pass number', () => {
    expect(filterWalletPasses(passes, { query: 'bogot' }).map((p) => p.pass_id)).toEqual(['colombia']);
    expect(filterWalletPasses(passes, { query: 'santiago' }).map((p) => p.pass_id)).toEqual(['chile']);
    expect(filterWalletPasses(passes, { query: 'BSL-GENERAL' })).toHaveLength(3);
  });

  it('ignores case and surrounding whitespace in the query', () => {
    expect(filterWalletPasses(passes, { query: '  ChIlE  ' }).map((p) => p.pass_id)).toEqual(['chile']);
  });

  it('combines filters', () => {
    expect(
      filterWalletPasses(passes, { timeline: 'upcoming', passType: 'general' }).map((p) => p.pass_id)
    ).toEqual(['chile']);
  });
});

describe('countWalletPasses', () => {
  it('counts each timeline bucket', () => {
    const passes = buildWalletPasses(
      [
        makePass({ pass_id: 'chile', event_id: 'chile2026' }),
        makePass({ pass_id: 'colombia', event_id: 'colombia2026' }),
        makePass({ pass_id: 'archive', event_id: 'bsl2025' }),
      ],
      AUGUST_6_2026
    );

    expect(countWalletPasses(passes)).toEqual({ total: 3, live: 1, upcoming: 1, past: 1 });
  });
});

describe('getPassTypeAccent', () => {
  it('maps each known pass type to its colour and everything else to grey', () => {
    expect(getPassTypeAccent('general')).toBe('#34A853');
    expect(getPassTypeAccent('business')).toBe('#007AFF');
    expect(getPassTypeAccent('vip')).toBe('#FF9500');
    expect(getPassTypeAccent(undefined)).toBe('#8E8E93');
  });
});
