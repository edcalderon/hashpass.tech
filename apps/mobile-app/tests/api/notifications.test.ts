/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockIsResolveIdentityError = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveNotificationIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsResolveIdentityError(identity),
}));

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe('notifications api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockFrom.mockReset();
  });

  describe('GET', () => {
    it('returns empty list when user has no registry id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/notifications+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/notifications'));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [], resolvedUserId: null });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/notifications+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/notifications'));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns notifications for the resolved registry id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/notifications+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/notifications?limit=10'));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [], resolvedUserId: 'registry-id-123' });
    });

    it('returns 500 when the notifications query errors', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
            }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/notifications+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/notifications'));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to fetch notifications' });
    });

    it('returns 500 when the notifications query throws unexpectedly', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        select: () => {
          throw new Error('unexpected');
        },
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/notifications+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/notifications'));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to fetch notifications' });
    });
  });

  describe('PATCH', () => {
    it('returns success without querying when user has no registry id', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications+api');
      const response = await PATCH(new Request('https://api.hashpass.tech/api/notifications', { method: 'PATCH' }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications+api');
      const response = await PATCH(new Request('https://api.hashpass.tech/api/notifications', { method: 'PATCH' }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('marks all unread notifications as read', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications+api');
      const response = await PATCH(new Request('https://api.hashpass.tech/api/notifications', { method: 'PATCH' }));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('returns 500 when marking as read errors', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: { message: 'update failed' } }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications+api');
      const response = await PATCH(new Request('https://api.hashpass.tech/api/notifications', { method: 'PATCH' }));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to mark notifications as read' });
    });

    it('returns 500 when marking as read throws unexpectedly', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ registryUserId: 'registry-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => {
          throw new Error('unexpected');
        },
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications+api');
      const response = await PATCH(new Request('https://api.hashpass.tech/api/notifications', { method: 'PATCH' }));

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to mark notifications as read' });
    });
  });
});
