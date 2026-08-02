/// <reference types="jest" />

import { buildNotificationEventPath } from '../../lib/notification-navigation';

describe('buildNotificationEventPath', () => {
  it('uses the linked meeting request event instead of the legacy default event', () => {
    expect(
      buildNotificationEventPath(
        { event_id: 'bsl' },
        { event_id: 'chile2026' },
        'networking/my-requests',
      ),
    ).toBe('/events/chile2026/networking/my-requests');
  });

  it('uses the notification event when no linked request is available', () => {
    expect(
      buildNotificationEventPath({ event_id: 'chile2026' }, null, 'speakers/speaker-1'),
    ).toBe('/events/chile2026/speakers/speaker-1');
  });
});
