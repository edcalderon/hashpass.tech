/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockFrom = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockUpsert = jest.fn();

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

const makeProfilesTable = () => {
  const lookup: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  lookup.select = jest.fn(() => lookup);
  lookup.eq = jest.fn((...args: unknown[]) => {
    mockEq(...args);
    return lookup;
  });
  lookup.maybeSingle = mockMaybeSingle;

  const update: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  update.select = jest.fn(() => update);
  update.single = mockSingle;
  lookup.upsert = jest.fn((...args: unknown[]) => {
    mockUpsert(...args);
    return update;
  });
  return lookup;
};

describe('/api/profile/attendee', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockFrom.mockReset();
    mockMaybeSingle.mockReset();
    mockSingle.mockReset();
    mockEq.mockReset();
    mockUpsert.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
    });
    mockFrom.mockImplementation(() => makeProfilesTable());
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the signed-in attendee profile information', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { full_name: 'Grace Hopper', title: 'Rear Admiral', company: 'United States Navy' },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/profile/attendee+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/profile/attendee'));

    await expect(response.json()).resolves.toEqual({
      data: { fullName: 'Grace Hopper', title: 'Rear Admiral', company: 'United States Navy' },
    });
    expect(mockEq).toHaveBeenCalledWith('user_id', '7f60f5d2-5948-4df1-9670-2f9177cf2fe4');
  });

  it('returns null profile fields when the attendee profile has not been created yet', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/profile/attendee+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/profile/attendee'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { fullName: null, title: null, company: null },
    });
  });

  it('returns authentication and account-linking errors before accessing attendee data', async () => {
    mockResolveNotificationIdentity.mockResolvedValueOnce({ error: 'Sign in required', status: 401 });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET, PATCH } = require('../../app/api/profile/attendee+api');
    const unauthorized = await GET(new Request('https://api.hashpass.tech/api/profile/attendee'));
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({ error: 'Sign in required' });

    mockResolveNotificationIdentity.mockResolvedValueOnce({ supabaseUserId: null });
    const unlinked = await PATCH(new Request('https://api.hashpass.tech/api/profile/attendee', {
      method: 'PATCH', body: JSON.stringify({ title: 'Director', company: 'Hashpass' }),
    }));
    expect(unlinked.status).toBe(403);
    await expect(unlinked.json()).resolves.toEqual({
      error: 'Account is not linked to an attendee identity',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns a server error when the attendee profile cannot be loaded', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/profile/attendee+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/profile/attendee'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to load attendee profile' });
  });

  it('normalizes and saves only the signed-in attendee information', async () => {
    mockSingle.mockResolvedValue({
      data: { full_name: 'Grace Hopper', title: 'Rear Admiral', company: 'United States Navy' },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/attendee+api');
    const response = await PATCH(new Request('https://api.hashpass.tech/api/profile/attendee', {
      method: 'PATCH',
      body: JSON.stringify({ title: ' Rear Admiral ', company: ' United States Navy ' }),
    }));

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
        title: 'Rear Admiral',
        company: 'United States Navy',
      },
      { onConflict: 'user_id' },
    );
    await expect(response.json()).resolves.toEqual({
      data: { fullName: 'Grace Hopper', title: 'Rear Admiral', company: 'United States Navy' },
    });
  });

  it('rejects malformed and non-text attendee profile updates', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/attendee+api');
    const malformed = await PATCH(new Request('https://api.hashpass.tech/api/profile/attendee', {
      method: 'PATCH', body: '{',
    }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: 'A JSON body is required' });

    const invalidTitle = await PATCH(new Request('https://api.hashpass.tech/api/profile/attendee', {
      method: 'PATCH', body: JSON.stringify({ title: 7, company: 'Hashpass' }),
    }));
    expect(invalidTitle.status).toBe(400);
    await expect(invalidTitle.json()).resolves.toEqual({ error: 'Title must be text' });

    const invalidCompany = await PATCH(new Request('https://api.hashpass.tech/api/profile/attendee', {
      method: 'PATCH', body: JSON.stringify({ title: 'Director', company: false }),
    }));
    expect(invalidCompany.status).toBe(400);
    await expect(invalidCompany.json()).resolves.toEqual({ error: 'Company must be text' });
  });

  it('clears blank values, limits long values, and reports update failures', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'write failed' } });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/attendee+api');
    const response = await PATCH(new Request('https://api.hashpass.tech/api/profile/attendee', {
      method: 'PATCH',
      body: JSON.stringify({ title: ' ', company: ` ${'c'.repeat(200)} ` }),
    }));

    expect(mockUpsert).toHaveBeenCalledWith(
      {
        user_id: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
        title: null,
        company: 'c'.repeat(160),
      },
      { onConflict: 'user_id' },
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to update attendee profile' });
  });
});
