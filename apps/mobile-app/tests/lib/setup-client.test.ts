import { fetchSetup, requestSetPin, requestVerifyPin, saveSetup, SetupRequestError } from '../../lib/setup-client';

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
}));

const setup = { status: 'complete', step: 3, goals: [], topics: [], privacyScope: 'private', consentVersion: 1, completedAt: null, pin: { enabled: true, lockedUntil: null, remainingAttempts: 5 } };
// apiClient wraps the server body: { success, data: <server body> }, and the server body is { success, data }.
const wrapped = (data: unknown) => ({ success: true, data: { success: true, data } });

describe('setup client', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unwraps both envelope levels and asks for a global, non-retried request', async () => {
    mockGet.mockResolvedValue(wrapped(setup));
    await expect(fetchSetup()).resolves.toEqual(setup);
    expect(mockGet).toHaveBeenCalledWith('setup', { skipEventSegment: true, retries: 0 });
  });

  it('posts a patch to the same route', async () => {
    mockPost.mockResolvedValue(wrapped(setup));
    await saveSetup({ goals: ['learn'], step: 1 });
    expect(mockPost).toHaveBeenCalledWith('setup', { goals: ['learn'], step: 1 }, { skipEventSegment: true, retries: 0 });
  });

  it('carries the PIN only in the request body and never retries it', async () => {
    mockPost.mockResolvedValue(wrapped({ ok: true, enabled: true, remainingAttempts: 5, lockedUntil: null }));
    await requestSetPin('4321');
    await requestSetPin('2222', '1111');
    await requestVerifyPin('4321', 'wallet:sign');
    expect(mockPost.mock.calls.map(([endpoint, body, options]) => [endpoint, body, options])).toEqual([
      ['setup/pin', { action: 'set', pin: '4321' }, { skipEventSegment: true, retries: 0 }],
      ['setup/pin', { action: 'set', pin: '2222', currentPin: '1111' }, { skipEventSegment: true, retries: 0 }],
      ['setup/pin', { action: 'verify', pin: '4321', scope: 'wallet:sign' }, { skipEventSegment: true, retries: 0 }],
    ]);
  });

  it('turns a transport failure into a typed error with the status', async () => {
    mockGet.mockResolvedValue({ success: false, error: 'unavailable', status: 503, data: null });
    await expect(fetchSetup()).rejects.toMatchObject({ name: 'SetupRequestError', code: 'unavailable', status: 503 });
    mockGet.mockResolvedValue({ success: false, error: '', data: null });
    await expect(fetchSetup()).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('surfaces the server error code from a 2xx-wrapped failure body', async () => {
    mockPost.mockResolvedValue({ success: true, data: { success: false, error: 'pin_already_set' } });
    await expect(requestSetPin('1234')).rejects.toMatchObject({ code: 'pin_already_set' });
  });

  it.each([
    ['no body', { success: true, data: null }],
    ['an unsuccessful body without a code', { success: true, data: { success: false } }],
    ['a body with no payload', { success: true, data: { success: true } }],
    ['a null payload', { success: true, data: { success: true, data: null } }],
  ])('rejects %s instead of passing undefined along', async (_label, response) => {
    mockGet.mockResolvedValue(response);
    const error = await fetchSetup().catch(reason => reason);
    expect(error).toBeInstanceOf(SetupRequestError);
    expect(error.code).toBe('unexpected_response');
  });
});
