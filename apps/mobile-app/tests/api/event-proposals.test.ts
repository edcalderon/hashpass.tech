/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

import fs from "node:fs";
import path from "node:path";

const mockValidateToken = jest.fn();
const mockRateLimitOk = jest.fn();
const mockSendEventProposalEmail = jest.fn();

jest.mock("@/lib/cap-instance", () => ({
  __esModule: true,
  default: { validateToken: (...args: unknown[]) => mockValidateToken(...args) },
}));
jest.mock("@/lib/bsl/rateLimit", () => ({
  rateLimitOk: (...args: unknown[]) => mockRateLimitOk(...args),
}));
jest.mock("@/lib/email", () => ({
  sendEventProposalEmail: (...args: unknown[]) => mockSendEventProposalEmail(...args),
}));

const routePath = path.resolve(__dirname, "../../app/api/event-proposals+api.ts");

const loadPost = (): ((request: Request) => Promise<Response>) => {
  expect(fs.existsSync(routePath)).toBe(true);
  return require(routePath).POST;
};

const validProposal = {
  eventName: "Open LATAM",
  contactName: "Ada Organizer",
  email: "ada@example.com",
  eventDetails: "Bogotá, October 2026. Community event proposal.",
  captchaToken: "cap-token-once",
};

const requestFor = (
  body: Record<string, unknown>,
  clientIp = "198.51.100.23, 10.0.0.4",
) =>
  new Request("https://api.hashpass.tech/api/event-proposals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": clientIp,
    },
    body: JSON.stringify(body),
  });

describe("POST /api/event-proposals", () => {
  beforeEach(() => {
    jest.resetModules();
    mockValidateToken.mockReset();
    mockRateLimitOk.mockReset();
    mockSendEventProposalEmail.mockReset();
    mockValidateToken.mockResolvedValue({ success: true });
    mockRateLimitOk.mockReturnValue(true);
    mockSendEventProposalEmail.mockResolvedValue({ success: true, messageId: "proposal-1" });
  });

  it("validates a fresh Cap token and delegates sanitized proposal delivery to the dedicated mailer", async () => {
    const POST = loadPost();
    const response = await POST(
      requestFor({
        eventName: "  Open\u0000   LATAM  ",
        contactName: "  Ada\tOrganizer  ",
        email: "  ADA@Example.COM  ",
        eventDetails: "  Bogotá\r\nOctober 2026. Community event proposal.\u0000  ",
        captchaToken: "cap-token-once",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockValidateToken).toHaveBeenCalledWith("cap-token-once");
    expect(mockSendEventProposalEmail).toHaveBeenCalledWith({
      eventName: "Open LATAM",
      contactName: "Ada Organizer",
      email: "ada@example.com",
      eventDetails: "Bogotá\nOctober 2026. Community event proposal.",
    });
  });

  it("rejects a replayed single-use Cap token without sending a second email", async () => {
    mockValidateToken
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    const POST = loadPost();

    const first = await POST(requestFor(validProposal));
    const replay = await POST(requestFor(validProposal));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({ captchaExpired: true });
    expect(mockSendEventProposalEmail).toHaveBeenCalledTimes(1);
  });

  it("rate-limits by the first trusted client identity before validating Cap or sending email", async () => {
    mockRateLimitOk.mockReturnValue(false);
    const POST = loadPost();

    const response = await POST(
      requestFor(validProposal, "198.51.100.24, 10.0.0.5"),
    );

    expect(response.status).toBe(429);
    expect(mockRateLimitOk).toHaveBeenCalledWith(
      "event-proposals:ip:198.51.100.24",
    );
    expect(mockValidateToken).not.toHaveBeenCalled();
    expect(mockSendEventProposalEmail).not.toHaveBeenCalled();
  });

  it("rejects missing Cap proof and malformed or oversized fields before delivery", async () => {
    const POST = loadPost();
    const invalidBodies = [
      { ...validProposal, captchaToken: "" },
      { ...validProposal, email: "not-an-email" },
      { ...validProposal, eventName: "e".repeat(161) },
      { ...validProposal, contactName: "c".repeat(121) },
      { ...validProposal, email: `${"a".repeat(244)}@example.com` },
      { ...validProposal, eventDetails: "d".repeat(5001) },
    ];

    for (const body of invalidBodies) {
      const response = await POST(requestFor(body));
      expect(response.status).toBe(400);
    }

    expect(mockValidateToken).not.toHaveBeenCalled();
    expect(mockSendEventProposalEmail).not.toHaveBeenCalled();
  });

  it("does not report success when the dedicated proposal mailer fails", async () => {
    mockSendEventProposalEmail.mockResolvedValue({
      success: false,
      error: "Email delivery failed",
    });
    const POST = loadPost();

    const response = await POST(requestFor(validProposal));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "proposal_email_failed",
    });
  });
});
