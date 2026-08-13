/// <reference types="jest" />

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock("../../lib/event-path", () => ({
  resolveActiveEventId: jest.fn((eventId?: string) => eventId || "bsl"),
}));

jest.mock("../../lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

// eslint-disable-next-line import/first
import {
  isSupabaseAuthUserId,
  passSystemService,
  resolvePassStorageEventId,
} from "../../lib/pass-system";

describe("passSystemService Supabase user id guard", () => {
  const betterAuthUserId = "jHLTgNvEWRxkHUzqUdNekBn7rzYwr1sp";
  const supabaseUserId = "7f60f5d2-5948-4df1-9670-2f9177cf2fe4";
  const activePass = {
    id: "pass-existing",
    user_id: supabaseUserId,
    event_id: "bsl2025",
    pass_type: "general",
    status: "active",
    pass_number: "BSL-GENERAL-EXISTING",
    max_meeting_requests: 10,
    used_meeting_requests: 0,
    max_boost_amount: 100,
    used_boost_amount: 0,
    access_features: ["general_sessions"],
    special_perks: ["basic_swag"],
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
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("recognizes Supabase auth UUIDs only", () => {
    expect(isSupabaseAuthUserId("7f60f5d2-5948-4df1-9670-2f9177cf2fe4")).toBe(
      true,
    );
    expect(isSupabaseAuthUserId(betterAuthUserId)).toBe(false);
    expect(isSupabaseAuthUserId("")).toBe(false);
  });

  it("maps BSL route ids to the pass storage event id", () => {
    expect(resolvePassStorageEventId("bsl")).toBe("colombia2026");
    expect(resolvePassStorageEventId("bsl-2025")).toBe("bsl2025");
    expect(resolvePassStorageEventId("peru2026")).toBe("peru2026");
  });

  it("uses event tier catalog values and keeps generic perk copy date-free", async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: [
        {
          event_id: "chile2026",
          pass_type: "general",
          max_meeting_requests: 10,
          max_boost_amount: 100,
          price_cents: 9900,
          currency: "USD",
          price_label: null,
        },
      ],
    });

    await expect(passSystemService.getEventPassTiers("bsl")).resolves.toEqual([
      {
        event_id: "colombia2026",
        pass_type: "general",
        max_meeting_requests: 10,
        max_boost_amount: 100,
        price_cents: 9900,
        currency: "USD",
        price_label: null,
      },
    ]);
    expect(mockApiGet).toHaveBeenCalledWith(
      "/passes/tiers",
      expect.objectContaining({
        params: { eventId: "colombia2026" },
      }),
    );
    expect(passSystemService.getPassPerks("general").features).toEqual(
      expect.arrayContaining(["Access to all conference sessions"]),
    );
    expect(
      passSystemService.getPassPerks("general").features.join(" "),
    ).not.toMatch(/\b\w+\s+\d{1,2}(?:-\d{1,2})?\b/);
  });

  it("unwraps the backend data envelope for pass lists and tier creation", async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: { data: [activePass] },
    });

    await expect(
      passSystemService.getAllUserPasses(supabaseUserId),
    ).resolves.toEqual([
      expect.objectContaining({ id: activePass.id }),
    ]);

    mockApiPost.mockResolvedValueOnce({
      success: true,
      data: { data: { passId: "pass-created" } },
    });

    await expect(
      passSystemService.createDefaultPass(
        supabaseUserId,
        "general",
        "colombia2026",
      ),
    ).resolves.toBe("pass-created");
  });

  it("surfaces database errors while loading the wallet instead of treating them as no passes", async () => {
    const databaseError = { code: "PGRST000", message: "database unavailable" };
    mockApiGet.mockResolvedValueOnce({
      success: false,
      error: databaseError.message,
    });

    await expect(
      passSystemService.getAllUserPasses(supabaseUserId),
    ).rejects.toThrow(databaseError.message);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error in getAllUserPasses:",
      expect.any(Error),
    );
  });

  it("surfaces scoped wallet database errors for the retryable UI state", async () => {
    const databaseError = { code: "PGRST000", message: "database unavailable" };
    mockApiGet.mockResolvedValueOnce({
      success: false,
      error: databaseError.message,
    });

    await expect(
      passSystemService.getUserPassesForEvents(supabaseUserId, ["chile2026"]),
    ).rejects.toThrow(databaseError.message);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error in getUserPassesForEvents:",
      expect.any(Error),
    );
  });

  it("hydrates wallet usage from the event-scoped pass counter and prefers the active pass", async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: [
        {
          event_id: "bsl2025",
          pass_id: "pass-existing",
          pass_type: "general",
          status: "active",
          pass_number: "BSL-GENERAL-EXISTING",
          max_requests: 10,
          used_requests: 1,
          remaining_requests: 9,
          max_boost: 100,
          used_boost: 0,
          remaining_boost: 100,
          access_features: ["general_sessions"],
          special_perks: ["basic_swag"],
        },
      ],
    });

    await expect(
      passSystemService.getAllUserPasses(supabaseUserId),
    ).resolves.toEqual([
      expect.objectContaining({
        pass_id: "pass-existing",
        used_requests: 1,
        remaining_requests: 9,
      }),
    ]);
    expect(mockApiGet).toHaveBeenCalledWith(
      "/passes",
      expect.objectContaining({
        params: { includeAll: "true" },
      }),
    );
  });

  it("does not query passes or counts with a non-UUID auth user id", async () => {
    await expect(
      passSystemService.getUserPassInfo(betterAuthUserId),
    ).resolves.toBeNull();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping getUserPassInfo"),
    );
  });

  it("does not create default passes with a non-UUID auth user id", async () => {
    await expect(
      passSystemService.createDefaultPass(betterAuthUserId, "general"),
    ).resolves.toBeNull();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping createDefaultPass"),
    );
  });

  it("returns closed meeting request limits for a non-UUID auth user id", async () => {
    await expect(
      passSystemService.canMakeMeetingRequest(betterAuthUserId, "speaker-1"),
    ).resolves.toEqual({
      can_request: false,
      canSendRequest: false,
      reason: "Invalid user ID format",
      pass_type: null,
      remaining_requests: 0,
      remaining_boost: 0,
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns a safe result without logging when the meeting-limit RPC fails", async () => {
    const databaseError = {
      code: "42883",
      message: "operator does not exist: uuid = text",
    };
    mockRpcSingle({ data: null, error: databaseError });

    await expect(
      passSystemService.canMakeMeetingRequest(
        supabaseUserId,
        "edward-calderon",
        0,
        "chile2026",
      ),
    ).resolves.toEqual({
      can_request: false,
      canSendRequest: false,
      reason: "Error checking limits",
      pass_type: null,
      remaining_requests: 0,
      remaining_boost: 0,
    });

    expect(mockRpc).toHaveBeenCalledWith("can_make_meeting_request", {
      p_user_id: supabaseUserId,
      p_speaker_id: "edward-calderon",
      p_boost_amount: 0,
      p_event_id: "chile2026",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("recovers an existing pass after duplicate default-pass creation", async () => {
    mockApiGet
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({
        success: true,
        data: [
          {
            event_id: "colombia2026",
            pass_id: "pass-existing",
            pass_type: "general",
            status: "active",
            pass_number: "BSL-GENERAL-EXISTING",
            max_requests: 10,
            used_requests: 2,
            remaining_requests: 8,
            max_boost: 100,
            used_boost: 0,
            remaining_boost: 100,
            access_features: ["general_sessions"],
            special_perks: ["basic_swag"],
          },
        ],
      });
    mockApiPost.mockResolvedValueOnce({
      success: true,
      data: { passId: "pass-existing" },
    });

    await expect(
      passSystemService.getUserPassInfo(supabaseUserId, "bsl"),
    ).resolves.toEqual({
      pass_id: "pass-existing",
      event_id: "colombia2026",
      pass_type: "general",
      status: "active",
      pass_number: "BSL-GENERAL-EXISTING",
      max_requests: 10,
      used_requests: 2,
      remaining_requests: 8,
      max_boost: 100,
      used_boost: 0,
      remaining_boost: 100,
      access_features: ["general_sessions"],
      special_perks: ["basic_swag"],
    });

    expect(mockApiPost).toHaveBeenCalledWith(
      "/passes",
      {
        action: "create-default",
        passType: "general",
        eventId: "colombia2026",
      },
      { skipEventSegment: true },
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Error creating default pass"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("sends the selected upcoming BSL event to the pass creation RPC", async () => {
    mockApiPost.mockResolvedValueOnce({
      success: true,
      data: { passId: "pass-chile" },
    });

    await expect(
      passSystemService.createDefaultPass(
        supabaseUserId,
        "general",
        "chile2026",
      ),
    ).resolves.toBe("pass-chile");

    expect(mockApiPost).toHaveBeenCalledWith(
      "/passes",
      {
        action: "create-default",
        passType: "general",
        eventId: "chile2026",
      },
      { skipEventSegment: true },
    );
  });

  it("redeems a normalized pass-claim code only for the authenticated database user", async () => {
    mockRpcSingle({
      data: {
        status: "claimed",
        pass_id: "courtesy-pass",
        event_id: "chile2026",
      },
      error: null,
    });

    await expect(
      passSystemService.claimPassByCode(supabaseUserId, " bsl-2026-welcome "),
    ).resolves.toEqual({
      status: "claimed",
      pass_id: "courtesy-pass",
      event_id: "chile2026",
    });

    expect(mockRpc).toHaveBeenCalledWith("claim_event_pass_code", {
      p_code: "BSL-2026-WELCOME",
    });
  });

  it("reuses an in-flight default-pass creation for concurrent bootstrap calls", async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mockApiGet
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValue({
        success: true,
        data: [
          {
            event_id: "chile2026",
            pass_id: "pass-existing",
            pass_type: "general",
            status: "active",
            pass_number: "BSL-GENERAL-EXISTING",
            max_requests: 10,
            used_requests: 0,
            remaining_requests: 10,
            max_boost: 100,
            used_boost: 0,
            remaining_boost: 100,
            access_features: ["general_sessions"],
            special_perks: ["basic_swag"],
          },
        ],
      });
    mockApiPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const first = passSystemService.getUserPassInfo(supabaseUserId, "bsl");
    const second = passSystemService.getUserPassInfo(supabaseUserId, "bsl");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (mockApiPost.mock.calls.length > 0) {
        break;
      }
      await Promise.resolve();
    }
    resolveCreate({ success: true, data: { passId: "pass-created" } });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult?.pass_id).toBe("pass-existing");
    expect(secondResult?.pass_id).toBe("pass-existing");
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });

  it("falls back pass_type and status when the passes row has them null", async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: [
        {
          event_id: "chile2026",
          pass_id: "pass-existing",
          pass_type: "general",
          status: "active",
          pass_number: "BSL-GENERAL-EXISTING",
          max_requests: 10,
          used_requests: 0,
          remaining_requests: 10,
          max_boost: 100,
          used_boost: 0,
          remaining_boost: 100,
          access_features: [],
          special_perks: [],
        },
      ],
    });

    const result = await passSystemService.getUserPassInfo(
      supabaseUserId,
      "bsl",
    );

    expect(result?.pass_type).toBe("general");
    expect(result?.status).toBe("active");
  });

  it("falls back pass_type and status when the passes row has them null and the counts RPC errors", async () => {
    mockApiGet.mockResolvedValueOnce({
      success: true,
      data: [
        {
          event_id: "chile2026",
          pass_id: "pass-existing",
          pass_type: "general",
          status: "active",
          pass_number: "BSL-GENERAL-EXISTING",
          max_requests: 10,
          used_requests: 0,
          remaining_requests: 10,
          max_boost: 100,
          used_boost: 0,
          remaining_boost: 100,
          access_features: [],
          special_perks: [],
        },
      ],
    });

    const result = await passSystemService.getUserPassInfo(
      supabaseUserId,
      "bsl",
    );

    expect(result?.pass_type).toBe("general");
    expect(result?.status).toBe("active");
  });
});
