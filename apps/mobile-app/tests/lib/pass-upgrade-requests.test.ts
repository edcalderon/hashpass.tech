/// <reference types="jest" />

const mockPost = jest.fn();

jest.mock("../../lib/api-client", () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

describe("pass upgrade requests client", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("maps each pass tier to the next available tier", () => {
    const { nextPassType } = require("../../lib/pass-upgrade-requests");
    expect(nextPassType("general")).toBe("business");
    expect(nextPassType("business")).toBe("vip");
    expect(nextPassType("vip")).toBeNull();
  });

  it("posts a normalized ticket reference through the global API client", async () => {
    mockPost.mockResolvedValue({
      success: true,
      data: {
        data: {
          requestId: "request-1",
          status: "pending",
          currentPassType: "general",
          requestedPassType: "business",
        },
      },
    });
    const { requestPassUpgrade } = require("../../lib/pass-upgrade-requests");

    await expect(requestPassUpgrade({
      passId: "pass-1",
      eventId: "colombia2026",
      requestedPassType: "business",
      ticketReference: "  BSL-42  ",
    })).resolves.toMatchObject({ requestId: "request-1", status: "pending" });
    expect(mockPost).toHaveBeenCalledWith(
      "/pass-upgrade-requests",
      {
        passId: "pass-1",
        eventId: "colombia2026",
        requestedPassType: "business",
        ticketReference: "BSL-42",
      },
      { skipEventSegment: true },
    );
  });

  it("surfaces backend and malformed success responses", async () => {
    const { requestPassUpgrade } = require("../../lib/pass-upgrade-requests");
    mockPost.mockResolvedValueOnce({ success: false, error: "Ticket verification failed" });
    await expect(requestPassUpgrade({ passId: "pass-1", requestedPassType: "vip" }))
      .rejects.toThrow("Ticket verification failed");

    mockPost.mockResolvedValueOnce({ success: true, data: { data: {} } });
    await expect(requestPassUpgrade({ passId: "pass-1", requestedPassType: "vip" }))
      .rejects.toThrow("empty response");
  });
});
