/// <reference types="jest" />

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

jest.mock('../../lib/event-path', () => ({
  resolveActiveEventId: jest.fn(() => 'bsl'),
}));

// eslint-disable-next-line import/first
import {
  isSupabaseAuthUserId,
  passSystemService,
} from '../../lib/pass-system';

describe('passSystemService Supabase user id guard', () => {
  const betterAuthUserId = 'jHLTgNvEWRxkHUzqUdNekBn7rzYwr1sp';
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('recognizes Supabase auth UUIDs only', () => {
    expect(isSupabaseAuthUserId('7f60f5d2-5948-4df1-9670-2f9177cf2fe4')).toBe(true);
    expect(isSupabaseAuthUserId(betterAuthUserId)).toBe(false);
    expect(isSupabaseAuthUserId('')).toBe(false);
  });

  it('does not query passes or counts with a non-UUID auth user id', async () => {
    await expect(passSystemService.getUserPassInfo(betterAuthUserId)).resolves.toBeNull();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping getUserPassInfo')
    );
  });

  it('does not create default passes with a non-UUID auth user id', async () => {
    await expect(passSystemService.createDefaultPass(betterAuthUserId, 'general')).resolves.toBeNull();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping createDefaultPass')
    );
  });

  it('returns closed meeting request limits for a non-UUID auth user id', async () => {
    await expect(
      passSystemService.canMakeMeetingRequest(betterAuthUserId, 'speaker-1')
    ).resolves.toEqual({
      can_request: false,
      canSendRequest: false,
      reason: 'Invalid user ID format',
      pass_type: null,
      remaining_requests: 0,
      remaining_boost: 0,
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
