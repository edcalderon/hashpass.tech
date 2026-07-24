/// <reference types="jest" />

const mockFrom = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn((_request: Request) => ({ from: mockFrom }));
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSendSubscriptionConfirmation = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: (request: Request) => mockGetSupabaseServerForRequest(request),
}));

jest.mock('@/lib/email', () => ({
  sendSubscriptionConfirmation: (...args: unknown[]) => mockSendSubscriptionConfirmation(...args),
}));

jest.mock('@/lib/cap-instance', () => ({
  __esModule: true,
  default: { validateToken: jest.fn() },
}));

describe('subscribe api', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    mockGetSupabaseServerForRequest.mockClear();
    mockMaybeSingle.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockSendSubscriptionConfirmation.mockReset();

    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({
      eq: () => Promise.resolve({ error: null }),
    });
    mockSendSubscriptionConfirmation.mockResolvedValue({ success: true });

    mockFrom
      .mockReturnValueOnce({
        select: () => ({
          eq: () => ({ maybeSingle: mockMaybeSingle }),
        }),
      })
      .mockReturnValueOnce({ insert: mockInsert })
      .mockReturnValueOnce({ update: mockUpdate });
  });

  it('subscribes without requesting the inserted row back', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { POST } = require('../../app/api/subscribe+api');

    const response = await POST(
      new Request('https://api.hashpass.tech/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'reader@example.com', source: 'native' }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        email: 'reader@example.com',
        email_sent: false,
      }),
    ]);
    expect(mockUpdate).toHaveBeenCalledWith({ email_sent: true });
    expect(await response.json()).toEqual(
      expect.objectContaining({ success: true, emailSent: true })
    );
  });
});
