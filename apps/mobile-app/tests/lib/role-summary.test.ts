import {
  formatEffectiveRole,
  getEffectiveRole,
  isRoleActive,
} from '../../lib/role-summary';

describe('isRoleActive', () => {
  const now = Date.parse('2026-07-25T00:00:00.000Z');

  it('only accepts absent or future expiries', () => {
    expect(isRoleActive(null, now)).toBe(true);
    expect(isRoleActive(undefined, now)).toBe(true);
    expect(isRoleActive('2026-07-25T00:00:01.000Z', now)).toBe(true);
    expect(isRoleActive('2026-07-24T23:59:59.000Z', now)).toBe(false);
    expect(isRoleActive('not-a-date', now)).toBe(false);
  });
});

describe('getEffectiveRole', () => {
  it('prefers a global role over every event-scoped grant', () => {
    expect(getEffectiveRole('super_admin', [
      { eventId: 'bsl', role: 'event_admin' },
    ])).toEqual({ role: 'super_admin', scope: 'global', eventIds: [] });
  });

  it('uses sorted, unique event-admin scope before moderator scope', () => {
    expect(getEffectiveRole(null, [
      { eventId: 'zeta', role: 'moderator' },
      { eventId: 'bsl', role: 'event_admin' },
      { eventId: 'alpha', role: 'event_admin' },
      { eventId: 'bsl', role: 'event_admin' },
    ])).toEqual({
      role: 'event_admin',
      scope: 'event',
      eventIds: ['alpha', 'bsl'],
    });
  });

  it('uses moderator scope when no event-admin grant exists', () => {
    expect(getEffectiveRole(null, [
      { eventId: 'bsl', role: 'moderator' },
    ])).toEqual({ role: 'moderator', scope: 'event', eventIds: ['bsl'] });
  });

  it('returns a general user without grants', () => {
    expect(getEffectiveRole(null, [])).toEqual({ role: 'user', scope: 'none', eventIds: [] });
  });
});

describe('formatEffectiveRole', () => {
  it('shows an event admin and their event scope in the profile', () => {
    expect(formatEffectiveRole({
      role: 'event_admin',
      scope: 'event',
      eventIds: ['bsl'],
    })).toBe('Event Admin · BSL');
  });

  it('uses the global role label without an event suffix', () => {
    expect(formatEffectiveRole({
      role: 'super_admin',
      scope: 'global',
      eventIds: [],
    })).toBe('Super Admin');
  });

  it('does not append an empty event scope', () => {
    expect(formatEffectiveRole({
      role: 'user',
      scope: 'none',
      eventIds: [],
    })).toBe('General User');
  });
});
