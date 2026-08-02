/// <reference types="jest" />

import { getProfileRoleLabels } from '../../lib/profile-roles';

describe('getProfileRoleLabels', () => {
  it('keeps every active global, event, and speaker role in a stable display order', () => {
    expect(getProfileRoleLabels({
      globalRole: 'super_admin',
      globalRoles: ['admin', 'super_admin'],
      eventRoles: [
        { eventId: 'chile2026', role: 'moderator' },
        { eventId: 'bsl', role: 'event_admin' },
        { eventId: 'chile2026', role: 'event_admin' },
      ],
      effectiveRole: { role: 'super_admin', scope: 'global', eventIds: [] },
    }, true)).toEqual([
      'Super Admin',
      'Admin',
      'Event Admin · bsl',
      'Event Admin · chile2026',
      'Moderator · chile2026',
      'Speaker',
    ]);
  });

  it('returns no labels for an account without grants or a claimed speaker profile', () => {
    expect(getProfileRoleLabels(null, false)).toEqual([]);
  });
});
