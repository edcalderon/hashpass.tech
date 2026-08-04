/// <reference types="jest" />

const mockFrom = jest.fn();
const mockReadFile = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ from: mockFrom }),
}));
jest.mock('node:fs/promises', () => ({ readFile: (...args: unknown[]) => mockReadFile(...args) }));

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

describe('public agenda image route', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFrom.mockReset();
    mockReadFile.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_schedule_shares') return query(null, { user_id: 'registry-id' });
      if (table === 'user_profiles') return query(null, { full_name: 'Ada Lovelace' });
      if (table === 'user_agenda_status') return query([{ agenda_id: 'agenda-1' }]);
      return query([{ id: 'agenda-1', time: '08:30-09:30', title: 'Opening', location: 'Main stage', day: '1', day_name: 'Day 1' }]);
    });
  });

  it('renders a branded image with range-formatted agenda times', async () => {
    const { GET } = require('../../app/api/events/[eventId]/schedule/public/[shareToken]/image+api');
    const response = await GET(new Request('https://api.hashpass.tech/api/events/chile2026/schedule/public/token/image?day=1&locale=en'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/svg+xml');
    const svg = await response.text();
    expect(svg).toContain('8:30 AM');
    expect(svg).toContain('HASHPASS');
    expect(mockReadFile).toHaveBeenCalled();
  });
});
