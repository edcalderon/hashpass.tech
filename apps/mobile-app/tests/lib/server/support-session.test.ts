/// <reference types="jest" />

import {
  appIdFromRequest,
  generateSupportSessionToken,
  hashSupportSessionToken,
  resolveSupportSession,
  unauthorizedSupportResponse,
} from '@/lib/server/support-session';

function makeSupabase(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  return { from } as unknown as Parameters<typeof resolveSupportSession>[0];
}

function requestWith(headers: Record<string, string>) {
  return new Request('https://api.hashpass.tech/api/v1/support/tickets', { headers });
}

describe('generateSupportSessionToken / hashSupportSessionToken', () => {
  it('generates unique, non-empty tokens and hashes them deterministically', () => {
    const a = generateSupportSessionToken();
    const b = generateSupportSessionToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(20);
    expect(hashSupportSessionToken(a)).toEqual(hashSupportSessionToken(a));
    expect(hashSupportSessionToken(a)).not.toEqual(hashSupportSessionToken(b));
  });
});

describe('appIdFromRequest', () => {
  it('reads and trims the x-hashpass-app-id header', () => {
    expect(appIdFromRequest(requestWith({ 'x-hashpass-app-id': '  core  ' }))).toBe('core');
  });

  it('returns null when the header is missing or blank', () => {
    expect(appIdFromRequest(requestWith({}))).toBeNull();
    expect(appIdFromRequest(requestWith({ 'x-hashpass-app-id': '   ' }))).toBeNull();
  });
});

describe('resolveSupportSession', () => {
  const futureExpiry = new Date(Date.now() + 60_000).toISOString();
  const pastExpiry = new Date(Date.now() - 60_000).toISOString();

  it('returns null with no Authorization header', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await resolveSupportSession(supabase, requestWith({ 'x-hashpass-app-id': 'core' }));
    expect(result).toBeNull();
    expect((supabase as unknown as { from: jest.Mock }).from).not.toHaveBeenCalled();
  });

  it('returns null with no x-hashpass-app-id header, without querying the database', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await resolveSupportSession(supabase, requestWith({ authorization: 'Bearer sometoken' }));
    expect(result).toBeNull();
    expect((supabase as unknown as { from: jest.Mock }).from).not.toHaveBeenCalled();
  });

  it('resolves a valid, unexpired session for the matching app id', async () => {
    const supabase = makeSupabase({
      data: { id: 'session-1', visitor_id: 'visitor-1', app_id: 'core', expires_at: futureExpiry },
      error: null,
    });

    const result = await resolveSupportSession(
      supabase,
      requestWith({ authorization: 'Bearer sometoken', 'x-hashpass-app-id': 'core' }),
    );

    expect(result).toEqual({ sessionId: 'session-1', visitorId: 'visitor-1', appId: 'core' });
  });

  it('rejects a token whose stored session belongs to a different app id', async () => {
    const supabase = makeSupabase({
      data: { id: 'session-1', visitor_id: 'visitor-1', app_id: 'bsl', expires_at: futureExpiry },
      error: null,
    });

    const result = await resolveSupportSession(
      supabase,
      requestWith({ authorization: 'Bearer sometoken', 'x-hashpass-app-id': 'core' }),
    );

    expect(result).toBeNull();
  });

  it('rejects an expired session', async () => {
    const supabase = makeSupabase({
      data: { id: 'session-1', visitor_id: 'visitor-1', app_id: 'core', expires_at: pastExpiry },
      error: null,
    });

    const result = await resolveSupportSession(
      supabase,
      requestWith({ authorization: 'Bearer sometoken', 'x-hashpass-app-id': 'core' }),
    );

    expect(result).toBeNull();
  });

  it('returns null when no session row matches the token hash', async () => {
    const supabase = makeSupabase({ data: null, error: null });
    const result = await resolveSupportSession(
      supabase,
      requestWith({ authorization: 'Bearer sometoken', 'x-hashpass-app-id': 'core' }),
    );
    expect(result).toBeNull();
  });

  it('returns null on a database error rather than throwing', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'db down' } });
    const result = await resolveSupportSession(
      supabase,
      requestWith({ authorization: 'Bearer sometoken', 'x-hashpass-app-id': 'core' }),
    );
    expect(result).toBeNull();
  });
});

describe('unauthorizedSupportResponse', () => {
  it('returns a 401 with the given (or default) message', async () => {
    const response = unauthorizedSupportResponse();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: 'A valid support session is required' });
  });
});
