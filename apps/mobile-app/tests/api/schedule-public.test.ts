/// <reference types="jest" />

const mockFrom = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom }),
}));

const query = (result: unknown, singleResult?: unknown) => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    not: () => chain,
    maybeSingle: () => Promise.resolve({ data: singleResult ?? result, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: result, error: null }).then(resolve),
  };
  return chain;
};

describe('public schedule share route', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
  });

  it('resolves an owner through the registry provider mapping', async () => {
    let profileLookups = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_schedule_shares') return query(null, { user_id: 'registry-id' });
      if (table === 'user_profiles') {
        profileLookups += 1;
        return profileLookups === 1 ? query(null, null) : query(null, { full_name: 'Ada Lovelace' });
      }
      if (table === 'user') return query(null, { provider_ids: { supabase: 'auth-id' } });
      if (table === 'user_agenda_status') return query([{ agenda_id: 'agenda-1', status: 'confirmed' }]);
      return query([{ id: 'agenda-1', time: '08:30-09:30', title: 'Opening', speakers: [], type: 'keynote', location: null, day: '1', day_name: 'Day 1' }]);
    });

    const { GET } = require('../../app/api/events/[eventId]/schedule/public/[shareToken]+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events/chile2026/schedule/public/token'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.owner).toBe('@ada.lovelace');
    expect(body.data).toHaveLength(1);
    expect(body.data[0].time).toBe('08:30-09:30');
  });
});
