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
    mockResolveIdentity.mockResolvedValue({
      supabaseUserId: "auth-speaker-user-1",
      registryUserId: "speaker-user-1",
    });
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
      p_user_id: "auth-speaker-user-1",
      p_event_id: "chile2026",
    });
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        {
          table: "bsl_speakers",
          filters: [["user_id", "auth-speaker-user-1"]],
        },
        {
          table: "user_blocks",
          filters: [["speaker_id", "speaker-record-1"]],
        },
        {
          table: "meeting_requests",
          filters: [
            ["speaker_id", "auth-speaker-user-1"],
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

  it("rejects an unlinked identity without creating a provider query", async () => {
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: null });
    mockIsIdentityError.mockReturnValue(false);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/networking/stats+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/networking/stats"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Meeting identity required" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("validates the event route before reading statistics", async () => {
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: "user-1" });
    mockIsIdentityError.mockReturnValue(false);

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/networking/stats+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/invalid!/networking/stats"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A valid event id is required" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns zero speaker-only statistics when the identity is not a speaker", async () => {
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: "attendee-1" });
    mockIsIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({ data: { remaining_requests: 1 }, error: null });
    results.bsl_speakers = { data: null, error: null };

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/networking/stats+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/chile2026/networking/stats"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        counts: { remaining_requests: 1 },
        speaker: { blockedUsers: 0, speakerRequests: 0 },
      },
    });
    expect(queryCalls.map((call) => call.table)).toEqual(["bsl_speakers"]);
  });

  it("returns a safe response when the server-side statistics query fails", async () => {
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: "user-1" });
    mockIsIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({ data: null, error: { message: "denied" } });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/networking/stats+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/networking/stats"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load networking statistics" });
    expect(mockConsoleError).toHaveBeenCalled();
  });
});
