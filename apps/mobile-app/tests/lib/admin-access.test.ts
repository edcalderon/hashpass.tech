/// <reference types="jest" />

const mockGet = jest.fn();

jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));

describe('getCurrentAdminAccess', () => {
  beforeEach(() => {
    jest.resetModules();
    mockGet.mockReset();
  });

  it('keeps valid global and event grants returned by the provider-aware endpoint', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        data: {
          globalRole: 'admin',
          eventRoles: [
            { eventId: 'bsl', role: 'event_admin' },
            { eventId: 'side-event', role: 'moderator' },
            { eventId: 42, role: 'event_admin' },
            { eventId: 'bsl', role: 'viewer' },
          ],
          effectiveRole: {
            role: 'admin',
            scope: 'global',
            eventIds: [],
          },
        },
      },
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getCurrentAdminAccess } = require('../../lib/admin-access');

    await expect(getCurrentAdminAccess()).resolves.toEqual({
      globalRole: 'admin',
      eventRoles: [
        { eventId: 'bsl', role: 'event_admin' },
        { eventId: 'side-event', role: 'moderator' },
      ],
      effectiveRole: { role: 'admin', scope: 'global', eventIds: [] },
    });
    expect(mockGet).toHaveBeenCalledWith('/admin/access', { skipEventSegment: true });
  });

  it('derives a safe general-user role when the endpoint payload is malformed', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        data: {
          globalRole: 'owner',
          eventRoles: [{ eventId: 'bsl', role: 'viewer' }, null],
          effectiveRole: { role: 'super_admin', scope: 'unexpected', eventIds: ['bsl'] },
        },
      },
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getCurrentAdminAccess } = require('../../lib/admin-access');

    await expect(getCurrentAdminAccess()).resolves.toEqual({
      globalRole: null,
      eventRoles: [],
      effectiveRole: { role: 'user', scope: 'none', eventIds: [] },
    });
  });

  it('falls back to the computed event scope when the server omits effectiveRole', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        data: {
          globalRole: null,
          eventRoles: [
            { eventId: 'bsl', role: 'moderator' },
            { eventId: 'bsl', role: 'moderator' },
          ],
        },
      },
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getCurrentAdminAccess } = require('../../lib/admin-access');

    await expect(getCurrentAdminAccess()).resolves.toEqual({
      globalRole: null,
      eventRoles: [
        { eventId: 'bsl', role: 'moderator' },
        { eventId: 'bsl', role: 'moderator' },
      ],
      effectiveRole: { role: 'moderator', scope: 'event', eventIds: ['bsl'] },
    });
  });

  it('surfaces the endpoint error and uses a safe default if none is supplied', async () => {
    mockGet.mockResolvedValueOnce({ success: false, error: 'Session expired' });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getCurrentAdminAccess } = require('../../lib/admin-access');
    await expect(getCurrentAdminAccess()).rejects.toThrow('Session expired');

    mockGet.mockResolvedValueOnce({ success: false });
    await expect(getCurrentAdminAccess()).rejects.toThrow('Unable to load administrative access');
  });

  it('waits for authentication to finish before loading administrative access', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { canLoadCurrentAdminAccess } = require('../../lib/admin-access');

    expect(canLoadCurrentAdminAccess({ id: 'user-1' }, true)).toBe(false);
    expect(canLoadCurrentAdminAccess(null, false)).toBe(false);
    expect(canLoadCurrentAdminAccess({ id: 'user-1' }, false)).toBe(true);
  });
});
