/// <reference types="jest" />

const mockResolveNotificationIdentity = jest.fn();
const mockFrom = jest.fn();
const mockMaybeSingle = jest.fn();
const mockSingle = jest.fn();
const mockEq = jest.fn();
const mockUpdate = jest.fn();

const speaker = {
  id: '77191639-312a-41f2-ba33-70ae9d99ed46',
  name: 'Edward Calderón',
  title: 'Founder & CEO',
  company: 'Hashpass',
  imageurl: 'https://cdn.hashpass.tech/edward.png',
};

jest.mock('@/lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockResolveNotificationIdentity(...args),
  isResolveIdentityError: (value: { status?: unknown }) => typeof value?.status === 'number',
}));
jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

const makeSpeakerTable = () => {
  const lookup: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  lookup.select = jest.fn(() => lookup);
  lookup.eq = jest.fn((...args: unknown[]) => {
    mockEq(...args);
    return lookup;
  });
  lookup.maybeSingle = mockMaybeSingle;

  const update: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
  update.eq = jest.fn((...args: unknown[]) => {
    mockEq(...args);
    return update;
  });
  update.select = jest.fn(() => update);
  update.single = mockSingle;

  lookup.update = jest.fn((...args: unknown[]) => {
    mockUpdate(...args);
    return update;
  });
  return lookup;
};

describe('/api/profile/speaker', () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveNotificationIdentity.mockReset();
    mockFrom.mockReset();
    mockMaybeSingle.mockReset();
    mockSingle.mockReset();
    mockEq.mockReset();
    mockUpdate.mockReset();
    mockResolveNotificationIdentity.mockResolvedValue({
      supabaseUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
    });
    mockFrom.mockImplementation(() => makeSpeakerTable());
  });

  it('returns the signed-in user’s claimed speaker profile', async () => {
    mockMaybeSingle.mockResolvedValue({ data: speaker, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/profile/speaker+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/profile/speaker'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: speaker.id,
        name: speaker.name,
        title: speaker.title,
        company: speaker.company,
        imageUrl: speaker.imageurl,
      },
    });
    expect(mockEq).toHaveBeenCalledWith('user_id', '7f60f5d2-5948-4df1-9670-2f9177cf2fe4');
  });

  it('returns null when the account has no claimed speaker profile', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/profile/speaker+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/profile/speaker'));

    await expect(response.json()).resolves.toEqual({ data: null });
  });

  it('updates only the claimed speaker record and returns its normalized profile', async () => {
    mockMaybeSingle.mockResolvedValue({ data: speaker, error: null });
    mockSingle.mockResolvedValue({
      data: { ...speaker, title: 'Co-Founder', company: 'Hashpass Labs' },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/speaker+api');
    const response = await PATCH(new Request('https://api.hashpass.tech/api/profile/speaker', {
      method: 'PATCH',
      body: JSON.stringify({ title: ' Co-Founder ', company: ' Hashpass Labs ' }),
    }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ title: 'Co-Founder', company: 'Hashpass Labs' });
    expect(mockEq).toHaveBeenCalledWith('id', speaker.id);
    expect(mockEq).toHaveBeenCalledWith('user_id', '7f60f5d2-5948-4df1-9670-2f9177cf2fe4');
    await expect(response.json()).resolves.toMatchObject({
      data: { title: 'Co-Founder', company: 'Hashpass Labs' },
    });
  });

  it('rejects invalid image URLs and does not mutate a speaker profile', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/speaker+api');
    const response = await PATCH(new Request('https://api.hashpass.tech/api/profile/speaker', {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl: 'javascript:alert(1)' }),
    }));

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
