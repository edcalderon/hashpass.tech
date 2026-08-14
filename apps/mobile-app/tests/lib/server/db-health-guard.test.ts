/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const mockSendOpsAlertEmail = jest.fn(() => Promise.resolve());

type DbHealthGuard = {
  getGuardState: (profileId: string) => "closed" | "open";
  recordDbFailure: (options: {
    profileId: string;
    environment: "development" | "production";
    context: string;
    error?: unknown;
  }) => void;
  recordDbSuccess: (profileId: string) => void;
  shouldBackOff: (profileId: string) => boolean;
};

jest.mock("@/lib/email", () => ({
  sendOpsAlertEmail: mockSendOpsAlertEmail,
}));

const loadGuard = () => {
  jest.resetModules();
  return require("@/lib/server/db-health-guard") as DbHealthGuard;
};

describe("db health guard", () => {
  const consoleError = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  const consoleLog = jest
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  let now = 1_000_000;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    mockSendOpsAlertEmail.mockClear();
    consoleError.mockClear();
    consoleLog.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens, backs off, retries after cooldown, and recovers a profile", () => {
    const { getGuardState, recordDbFailure, recordDbSuccess, shouldBackOff } =
      loadGuard();

    recordDbFailure({
      profileId: "core-production",
      environment: "production",
      context: "identity upsert",
      error: new Error("database offline"),
    });
    now += 30_001;
    recordDbFailure({
      profileId: "core-production",
      environment: "production",
      context: "identity upsert",
    });
    for (let count = 0; count < 4; count += 1) {
      recordDbFailure({
        profileId: "core-production",
        environment: "production",
        context: "identity upsert",
      });
    }

    expect(getGuardState("core-production")).toBe("open");
    expect(shouldBackOff("core-production")).toBe(true);
    expect(mockSendOpsAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "[HASHPASS] Database backend unhealthy: core-production",
      }),
    );

    now += 60_001;
    expect(shouldBackOff("core-production")).toBe(false);
    recordDbSuccess("core-production");
    expect(getGuardState("core-production")).toBe("closed");
    expect(shouldBackOff("core-production")).toBe(false);
  });
});
