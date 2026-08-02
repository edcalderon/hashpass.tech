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
});
