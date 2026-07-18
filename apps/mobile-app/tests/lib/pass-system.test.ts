/// <reference types="jest" />

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('../../lib/event-path', () => ({
  resolveActiveEventId: jest.fn(() => 'bsl'),
}));

// eslint-disable-next-line import/first
import {
  isSupabaseAuthUserId,
  passSystemService,
  resolvePassStorageEventId,
} from '../../lib/pass-system';

describe('passSystemService Supabase user id guard', () => {
  const betterAuthUserId = 'jHLTgNvEWRxkHUzqUdNekBn7rzYwr1sp';
  const supabaseUserId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';
  const activePass = {
    id: 'pass-existing',
    user_id: supabaseUserId,
    event_id: 'bsl2025',
    pass_type: 'general',
    status: 'active',
    pass_number: 'BSL-GENERAL-EXISTING',
    max_meeting_requests: 10,
    used_meeting_requests: 0,
    max_boost_amount: 100,
    used_boost_amount: 0,
    access_features: ['general_sessions'],
    special_perks: ['basic_swag'],
  };
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  const mockPassQuery = (result: unknown) => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(result),
    };
    mockFrom.mockReturnValueOnce(query);
    return query;
  };

  const mockRpcSingle = (result: unknown) => {
    const query = {
      single: jest.fn().mockResolvedValue(result),
    };
    mockRpc.mockReturnValueOnce(query);
    return query;
  };

  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('recognizes Supabase auth UUIDs only', () => {
    expect(isSupabaseAuthUserId('7f60f5d2-5948-4df1-9670-2f9177cf2fe4')).toBe(true);
    expect(isSupabaseAuthUserId(betterAuthUserId)).toBe(false);
    expect(isSupabaseAuthUserId('')).toBe(false);
  });

  it('maps BSL route ids to the pass storage event id', () => {
    expect(resolvePassStorageEventId('bsl')).toBe('bsl2025');
    expect(resolvePassStorageEventId('bsl-2025')).toBe('bsl2025');
    expect(resolvePassStorageEventId('peru2026')).toBe('peru2026');
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

  it('recovers an existing pass after duplicate default-pass creation', async () => {
    mockPassQuery({ data: [], error: null });
    mockRpcSingle({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "passes_pkey"',
      },
    });
    mockPassQuery({ data: [activePass], error: null });
    mockPassQuery({ data: [activePass], error: null });
    mockRpcSingle({
      data: {
        total_requests: 2,
        remaining_requests: 8,
        remaining_boost: 100,
      },
      error: null,
    });

    await expect(passSystemService.getUserPassInfo(supabaseUserId, 'bsl')).resolves.toEqual({
      pass_id: 'pass-existing',
      pass_type: 'general',
      status: 'active',
      pass_number: 'BSL-GENERAL-EXISTING',
      max_requests: 10,
      used_requests: 2,
      remaining_requests: 8,
      max_boost: 100,
      used_boost: 0,
      remaining_boost: 100,
      access_features: ['general_sessions'],
      special_perks: ['basic_swag'],
    });

    expect(mockRpc).toHaveBeenCalledWith('create_default_pass', {
      p_user_id: supabaseUserId,
      p_pass_type: 'general',
    });
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Error creating default pass'),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('reuses an in-flight default-pass creation for concurrent bootstrap calls', async () => {
    mockPassQuery({ data: [], error: null });
    mockPassQuery({ data: [], error: null });

    let resolveCreate: (value: unknown) => void = () => {};
    mockRpc.mockReturnValueOnce({
      single: jest.fn().mockImplementation(() => new Promise((resolve) => {
        resolveCreate = resolve;
      })),
    });

    mockPassQuery({ data: [activePass], error: null });
    mockPassQuery({ data: [activePass], error: null });
    mockRpcSingle({
      data: {
        total_requests: 0,
        remaining_requests: 10,
        remaining_boost: 100,
      },
      error: null,
    });
    mockRpcSingle({
      data: {
        total_requests: 0,
        remaining_requests: 10,
        remaining_boost: 100,
      },
      error: null,
    });

    const first = passSystemService.getUserPassInfo(supabaseUserId, 'bsl');
    const second = passSystemService.getUserPassInfo(supabaseUserId, 'bsl');

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (mockRpc.mock.calls.some(([rpcName]) => rpcName === 'create_default_pass')) {
        break;
      }
      await Promise.resolve();
    }
    resolveCreate({ data: 'pass-created', error: null });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult?.pass_id).toBe('pass-existing');
    expect(secondResult?.pass_id).toBe('pass-existing');
    expect(mockRpc.mock.calls.filter(([rpcName]) => rpcName === 'create_default_pass')).toHaveLength(1);
  });

  it('falls back pass_type and status when the passes row has them null', async () => {
    mockPassQuery({
      data: [{ ...activePass, pass_type: null, status: null }],
      error: null,
    });
    mockRpcSingle({
      data: {
        total_requests: 0,
        remaining_requests: 10,
        remaining_boost: 100,
      },
      error: null,
    });

    const result = await passSystemService.getUserPassInfo(supabaseUserId, 'bsl');

    expect(result?.pass_type).toBe('general');
    expect(result?.status).toBe('active');
  });

  it('falls back pass_type and status when the passes row has them null and the counts RPC errors', async () => {
    mockPassQuery({
      data: [{ ...activePass, pass_type: null, status: null }],
      error: null,
    });
    mockRpcSingle({
      data: null,
      error: { code: 'PGRST000', message: 'counts unavailable' },
    });

    const result = await passSystemService.getUserPassInfo(supabaseUserId, 'bsl');

    expect(result?.pass_type).toBe('general');
    expect(result?.status).toBe('active');
  });
});
