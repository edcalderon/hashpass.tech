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
  is_active: true,
  is_accepting_meetings: true,
  directory_visible: true,
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
        eventImageUrl: speaker.imageurl,
        avatarSource: 'event',
        isActive: true,
        doNotDisturb: false,
        isAcceptingMeetings: true,
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
      body: JSON.stringify({ title: ' Co-Founder ', company: ' Hashpass Labs ', isActive: false }),
    }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      title: 'Co-Founder',
      company: 'Hashpass Labs',
      is_active: false,
      is_accepting_meetings: false,
    });
    expect(mockEq).toHaveBeenCalledWith('id', speaker.id);
    expect(mockEq).toHaveBeenCalledWith('user_id', '7f60f5d2-5948-4df1-9670-2f9177cf2fe4');
    await expect(response.json()).resolves.toMatchObject({
      data: { title: 'Co-Founder', company: 'Hashpass Labs' },
    });
  });

  it('reactivates meeting availability and directory publication for a retired profile', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        ...speaker,
        is_active: false,
        is_accepting_meetings: false,
        directory_visible: false,
      },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: {
        ...speaker,
        is_active: true,
        is_accepting_meetings: true,
        directory_visible: true,
      },
      error: null,
    });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/speaker+api');
    const response = await PATCH(new Request('https://api.hashpass.tech/api/profile/speaker', {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    }));

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      is_active: true,
      is_accepting_meetings: true,
      directory_visible: true,
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

  it('rejects a non-boolean speaker active flag before loading the profile', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/speaker+api');
    const response = await PATCH(new Request('https://api.hashpass.tech/api/profile/speaker', {
      method: 'PATCH',
      body: JSON.stringify({ isActive: 'true' }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'isActive must be a boolean' });
    expect(mockFrom).not.toHaveBeenCalled();
  });
  const patch = async (body: unknown) => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { PATCH } = require('../../app/api/profile/speaker+api');
    return PATCH(new Request('https://api.hashpass.tech/api/profile/speaker', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }));
  };

  it('rejects image URLs from hosts the app does not produce', async () => {
    const response = await patch({ imageUrl: 'https://tracker.example.com/pixel.png' });
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects an unknown photo source', async () => {
    const response = await patch({ avatarSource: 'cloud' });
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('requires an image URL to switch to the personal photo', async () => {
    const response = await patch({ avatarSource: 'personal' });
    expect(response.status).toBe(400);
  });

  it('keeps the event photo when switching to a personal photo', async () => {
    mockMaybeSingle.mockResolvedValue({ data: speaker, error: null });
    mockSingle.mockResolvedValue({ data: { ...speaker, avatar_source: 'personal' }, error: null });
    const response = await patch({ imageUrl: 'https://lh3.googleusercontent.com/a/me' });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      imageurl: 'https://lh3.googleusercontent.com/a/me',
      avatar_source: 'personal',
      event_imageurl: speaker.imageurl,
    });
  });

  it('restores the stored event photo when switching back', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...speaker, imageurl: 'https://lh3.googleusercontent.com/a/me', event_imageurl: 'https://cdn.hashpass.tech/event.png', avatar_source: 'personal' },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: speaker, error: null });
    const response = await patch({ avatarSource: 'event' });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      avatar_source: 'event',
      imageurl: 'https://cdn.hashpass.tech/event.png',
    });
  });

  it('does not overwrite the saved event photo on later personal-photo updates', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { ...speaker, imageurl: 'https://lh3.googleusercontent.com/a/old', event_imageurl: 'https://cdn.hashpass.tech/event.png', avatar_source: 'personal' },
      error: null,
    });
    mockSingle.mockResolvedValue({ data: speaker, error: null });
    await patch({ imageUrl: 'https://lh3.googleusercontent.com/a/new' });
    expect(mockUpdate).toHaveBeenCalledWith({
      imageurl: 'https://lh3.googleusercontent.com/a/new',
      avatar_source: 'personal',
    });
  });

  it('answers 409 when there is no event photo to switch back to', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { ...speaker, imageurl: null, event_imageurl: null }, error: null });
    const response = await patch({ avatarSource: 'event' });
    expect(response.status).toBe(409);
  });

  it('toggles do-not-disturb and validates its type', async () => {
    expect((await patch({ doNotDisturb: 'yes' })).status).toBe(400);
    mockMaybeSingle.mockResolvedValue({ data: speaker, error: null });
    mockSingle.mockResolvedValue({ data: { ...speaker, do_not_disturb: true }, error: null });
    const response = await patch({ doNotDisturb: true });
    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ do_not_disturb: true });
    await expect(response.json()).resolves.toMatchObject({ data: { doNotDisturb: true } });
  });

  it('answers 503 while the migration for these columns is not applied', async () => {
    mockMaybeSingle.mockResolvedValue({ data: speaker, error: null });
    mockSingle.mockResolvedValue({ data: null, error: { code: '42703', message: 'column does not exist' } });
    const response = await patch({ doNotDisturb: true });
    expect(response.status).toBe(503);
  });

  it('reads the speaker through the legacy columns before the migration', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'missing column' } })
      .mockResolvedValueOnce({ data: speaker, error: null });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/profile/speaker+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/profile/speaker'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { id: speaker.id, avatarSource: 'event' } });
  });
});
