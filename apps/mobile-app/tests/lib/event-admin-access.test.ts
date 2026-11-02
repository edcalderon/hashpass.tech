/// <reference types="jest" />

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import { effectiveEventRoleForEvent } from '../../lib/event-admin-access';

describe('effectiveEventRoleForEvent', () => {
  it('uses a direct grant for the requested event', () => {
    expect(effectiveEventRoleForEvent(
      [{ eventId: 'colombia2026', role: 'moderator' }],
      'colombia2026',
    )).toBe('moderator');
  });

  it('inherits an event-admin grant from a tour hub', () => {
    expect(effectiveEventRoleForEvent(
      [{ eventId: 'bsl', role: 'event_admin' }],
      'colombia2026',
    )).toBe('event_admin');
  });

  it('returns null when there is no direct or hub grant', () => {
    expect(effectiveEventRoleForEvent([], 'unknown-event')).toBeNull();
  });
});
