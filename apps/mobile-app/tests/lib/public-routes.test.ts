import {
  isPublicEventRoute,
  isPublicExplorerRoute,
  isPublicPassLinkRoute,
} from '../../lib/public-routes';
it('allows anonymous catalog and event pages without exposing neighboring routes', () => {
  expect(isPublicEventRoute('/events')).toBe(true);
  expect(isPublicEventRoute('/events/colombia2026')).toBe(true);
  expect(isPublicEventRoute('/events-private')).toBe(false);
  expect(isPublicEventRoute('/dashboard/wallet')).toBe(false);
});

it('allows only the Explorer within dashboard routes, with and without Expo route groups', () => {
  expect(isPublicExplorerRoute('/dashboard/explore')).toBe(true);
  expect(isPublicExplorerRoute('/(shared)/dashboard/explore')).toBe(true);
  expect(isPublicExplorerRoute('/dashboard/explore/')).toBe(true);
  for (const route of ['/dashboard/profile', '/dashboard/wallet', '/dashboard/notifications', '/dashboard/qr', '/dashboard/explore/private']) {
    expect(isPublicEventRoute(route)).toBe(false);
  }
});

it('allows only high-entropy public pass and transfer confirmation links', () => {
  expect(isPublicPassLinkRoute('/public-pass/opaque-share-token')).toBe(true);
  expect(isPublicPassLinkRoute('/(shared)/public-pass/opaque-share-token')).toBe(true);
  expect(isPublicPassLinkRoute('/transfer/confirm')).toBe(true);
  expect(isPublicPassLinkRoute('/(shared)/transfer/confirm/')).toBe(true);
  for (const route of ['/public-pass', '/transfer', '/transfer/history', '/dashboard/wallet']) {
    expect(isPublicPassLinkRoute(route)).toBe(false);
  }
});
