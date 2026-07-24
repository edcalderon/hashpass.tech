import { formatEffectiveRole } from '../../lib/role-summary';

describe('formatEffectiveRole', () => {
  it('shows an event admin and their event scope in the profile', () => {
    expect(formatEffectiveRole({
      role: 'event_admin',
      scope: 'event',
      eventIds: ['bsl'],
    })).toBe('Event Admin · BSL');
  });
});
