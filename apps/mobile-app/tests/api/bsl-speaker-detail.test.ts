/// <reference types="jest" />

const mockMaybeSingle = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}));

describe('/api/bsl/speakers/[id]', () => {
  beforeEach(() => {
    jest.resetModules();
    mockMaybeSingle.mockReset().mockResolvedValue({
      data: { id: 'speaker-1', name: 'Ada Lovelace', directory_visible: true },
      error: null,
    });
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
    };
    mockFrom.mockReset().mockReturnValue(query);
  });

  it('rejects a missing speaker id', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/bsl/speakers/[id]+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/bsl/speakers/'), { params: {} });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Missing speaker id' });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns a public speaker profile', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/bsl/speakers/[id]+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/bsl/speakers/speaker-1'), { params: { id: 'speaker-1' } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'speaker-1', name: 'Ada Lovelace', directory_visible: true });
    expect(mockFrom).toHaveBeenCalledWith('bsl_speakers');
  });

  it('returns not found for a private or missing profile', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require('../../app/api/bsl/speakers/[id]+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/bsl/speakers/missing'), { params: { id: 'missing' } });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  it('returns a safe server error when the profile query fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require('../../app/api/bsl/speakers/[id]+api');
      const response = await GET(new Request('https://api.hashpass.tech/api/bsl/speakers/speaker-1'), { params: { id: 'speaker-1' } });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Failed to fetch speaker' });
    } finally {
      errorSpy.mockRestore();
    }
  });
});
