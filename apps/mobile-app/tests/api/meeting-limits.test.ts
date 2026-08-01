/// <reference types="jest" />

const mockResolveIdentity = jest.fn();
const mockIsIdentityError = jest.fn();
const mockRpc = jest.fn();
let mockConsoleError: jest.SpyInstance;

jest.mock("@/lib/server/resolve-notification-identity", () => ({
  resolveNotificationIdentity: (request: Request) => mockResolveIdentity(request),
  isResolveIdentityError: (identity: unknown) => mockIsIdentityError(identity),
}));

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({ rpc: mockRpc }),
}));

describe("event meeting limits api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResolveIdentity.mockReset();
    mockIsIdentityError.mockReset();
    mockRpc.mockReset();
    mockConsoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => mockConsoleError.mockRestore());

  it("routes the requested event's limits through the backend RPC", async () => {
    mockResolveIdentity.mockResolvedValue({
      supabaseUserId: "auth-user-1",
      registryUserId: "user-1",
    });
    mockIsIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({ data: [{ remaining_requests: 2 }], error: null });

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/limits+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/chile2026/meetings/limits"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { remaining_requests: 2 } });
    expect(mockRpc).toHaveBeenCalledWith("get_user_meeting_request_counts", {
      p_user_id: "user-1",
      p_event_id: "chile2026",
    });
  });

  it("rejects unresolved identities and invalid event paths", async () => {
    mockResolveIdentity.mockResolvedValue({ error: "Unauthorized", status: 401 });
    mockIsIdentityError.mockReturnValue(true);
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/limits+api");
    expect(
      (await GET(new Request("https://api.hashpass.tech/api/events/bsl/meetings/limits"))).status,
    ).toBe(401);

    mockResolveIdentity.mockResolvedValue({ supabaseUserId: null });
    mockIsIdentityError.mockReturnValue(false);
    expect(
      (await GET(new Request("https://api.hashpass.tech/api/events/bsl/meetings/limits"))).status,
    ).toBe(403);

    mockResolveIdentity.mockResolvedValue({ supabaseUserId: "user-1" });
    expect(
      (await GET(new Request("https://api.hashpass.tech/api/events/invalid!/meetings/limits"))).status,
    ).toBe(400);
  });

  it("returns a safe backend failure", async () => {
    mockResolveIdentity.mockResolvedValue({ supabaseUserId: "user-1" });
    mockIsIdentityError.mockReturnValue(false);
    mockRpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { GET } = require("../../app/api/events/[eventId]/meetings/limits+api");
    const response = await GET(
      new Request("https://api.hashpass.tech/api/events/bsl/meetings/limits"),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to load meeting request limits" });
  });
});
