/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockIsIdentityError = jest.fn();
const mockRpc = jest.fn();
const mockFrom = jest.fn();

type QueryResult = { data: unknown; error: unknown };
type QueryCall = { table: string; filters: Array<[string, unknown]> };

let results: Record<string, QueryResult>;
let queryCalls: QueryCall[];
let mockConsoleError: jest.SpyInstance;

function createQuery(table: string): Record<string, unknown> {
  const call: QueryCall = { table, filters: [] };
  queryCalls.push(call);
  const query: Record<string, unknown> = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: unknown) => {
      call.filters.push([column, value]);
      return query;
    }),
    maybeSingle: jest.fn(async () => results[table]),
    then: (onFulfilled: (value: QueryResult) => unknown) =>
      Promise.resolve(results[table]).then(onFulfilled),
  };
  return query;
}

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsIdentityError(identity),
}));

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

describe("event networking stats api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset();
    mockIsIdentityError.mockReset();
    mockRpc.mockReset();
    mockFrom.mockReset();
    queryCalls = [];
    results = {
      bsl_speakers: { data: { id: "speaker-record-1" }, error: null },
      user_blocks: { data: [{ id: "block-1" }, { id: "block-2" }], error: null },
      meeting_requests: { data: [{ id: "request-1" }], error: null },
    };
    mockFrom.mockImplementation((table: string) => createQuery(table));
    mockConsoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => mockConsoleError.mockRestore());

  it("keeps counts and speaker statistics scoped to the requested event on the server", async () => {
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: "speaker-user-1" });
    mockIsIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({ data: [{ remaining_requests: 2, sent_requests: 3 }], error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/networking/stats+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/chile2026/networking/stats"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        counts: { remaining_requests: 2, sent_requests: 3 },
        speaker: { blockedUsers: 2, speakerRequests: 1 },
      },
    });
    expect(mockRpc).toHaveBeenCalledWith("get_user_meeting_request_counts", {
      p_user_id: "speaker-user-1",
      p_event_id: "chile2026",
    });
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        {
          table: "bsl_speakers",
          filters: [["user_id", "speaker-user-1"]],
        },
        {
          table: "user_blocks",
          filters: [["speaker_id", "speaker-record-1"]],
        },
        {
          table: "meeting_requests",
          filters: [
            ["speaker_id", "speaker-user-1"],
            ["event_id", "chile2026"],
          ],
        },
      ]),
    );
  });

  it("returns the identity error before accessing backend data", async () => {
    mockResolveIdentity.mockResolvedValue({ error: "Unauthorized", status: 401 });
    mockIsIdentityError.mockReturnValue(true);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/networking/stats+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/networking/stats"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
