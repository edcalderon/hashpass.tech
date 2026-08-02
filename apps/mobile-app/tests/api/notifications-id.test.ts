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

describe('notifications/[id] api', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockResolveNotificationIdentity.mockReset();
    mockIsResolveIdentityError.mockReset();
    mockFrom.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('PATCH', () => {
    it('returns 400 when id param is missing', async () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/', { method: 'PATCH' }),
        { params: { id: '' } }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Notification ID is required' });
    });

    it('recovers the id from the URL when Metro omits the route context', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => ({
          eq: (field: string, value: string) => ({
            eq: jest.fn().mockImplementation((field2: string, value2: string) => {
              expect(field).toBe('id');
              expect(value).toBe('notif-1');
              expect(field2).toBe('user_id');
              expect(value2).toBe('auth-id-123');
              return Promise.resolve({ error: null });
            }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_read: true }),
        }),
        undefined,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'PATCH' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when user has no Supabase identity', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'PATCH' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found' });
    });

    it('returns 400 when body has neither is_read nor is_archived', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'is_read or is_archived is required' });
    });

    it('marks a notification as read', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_read: true }),
        }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('archiving also marks the notification as read', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_archived: true }),
        }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('returns 500 when the update errors', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: { message: 'update failed' } }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_read: true }),
        }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to update notification' });
    });

    it('returns 500 when the update throws unexpectedly', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        update: () => {
          throw new Error('unexpected');
        },
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { PATCH } = require('../../app/api/notifications/[id]+api');
      const response = await PATCH(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ is_read: true }),
        }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to update notification' });
    });
  });

  describe('DELETE', () => {
    it('returns 400 when id param is missing', async () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/', { method: 'DELETE' }),
        { params: { id: '' } }
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Notification ID is required' });
    });

    it('recovers the id from the URL when Metro omits the route context', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        delete: () => ({
          eq: (field: string, value: string) => ({
            eq: jest.fn().mockImplementation((field2: string, value2: string) => {
              expect(field).toBe('id');
              expect(value).toBe('notif-1');
              expect(field2).toBe('user_id');
              expect(value2).toBe('auth-id-123');
              return Promise.resolve({ error: null });
            }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'DELETE' }),
        undefined,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('returns identity error if identity resolution fails', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ error: 'Unauthorized', status: 401 });
      mockIsResolveIdentityError.mockReturnValue(true);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'DELETE' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    it('returns 404 when user has no Supabase identity', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: null });
      mockIsResolveIdentityError.mockReturnValue(false);

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'DELETE' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Not found' });
    });

    it('deletes a notification', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        delete: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'DELETE' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    });

    it('returns 500 when the delete errors', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        delete: () => ({
          eq: () => ({
            eq: jest.fn().mockResolvedValue({ error: { message: 'delete failed' } }),
          }),
        }),
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'DELETE' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to delete notification' });
    });

    it('returns 500 when the delete throws unexpectedly', async () => {
      mockResolveNotificationIdentity.mockResolvedValue({ supabaseUserId: 'auth-id-123' });
      mockIsResolveIdentityError.mockReturnValue(false);
      mockFrom.mockReturnValue({
        delete: () => {
          throw new Error('unexpected');
        },
      });

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DELETE } = require('../../app/api/notifications/[id]+api');
      const response = await DELETE(
        new Request('https://api.hashpass.tech/api/notifications/notif-1', { method: 'DELETE' }),
        { params: { id: 'notif-1' } }
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to delete notification' });
    });
  });
});
