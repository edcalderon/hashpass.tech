/// <reference types="jest" />

jest.mock(
  "expo/virtual/env",
  () => ({
    __esModule: true,
    env: process.env,
  }),
  { virtual: true },
);

const mockGenerateLink = jest.fn();
const mockGetSupabaseServerEnv = jest.fn();
const mockGetSupabaseServerForRequest = jest.fn();
const mockListUsers = jest.fn();
const mockRpc = jest.fn();
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));
const originalFetch = global.fetch;
const originalBrevoApiKey = process.env.BREVO_API_KEY;
const originalNodemailerHost = process.env.NODEMAILER_HOST;
const originalNodemailerPort = process.env.NODEMAILER_PORT;
const originalNodemailerUser = process.env.NODEMAILER_USER;
const originalNodemailerPass = process.env.NODEMAILER_PASS;
const originalNodemailerFrom = process.env.NODEMAILER_FROM;

const verifiedPhoneAccount = {
  id: "user-123",
  email: "user@example.com",
  phone: "+573001112233",
  phone_confirmed_at: "2026-10-01T00:00:00.000Z",
};

const createAccountLookupBuilder = (account: unknown = null) => {
  const builder: Record<string, jest.Mock> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => ({ data: account, error: null })),
    single: jest.fn(async () => ({ data: account, error: null })),
    then: jest.fn((resolve) => resolve({ data: account, error: null })),
  };

  return builder;
};

jest.mock("../../../lib/supabase-server", () => ({
  getSupabaseServerEnv: mockGetSupabaseServerEnv,
  getSupabaseServerForRequest: mockGetSupabaseServerForRequest,
}));

jest.mock("nodemailer", () => ({
  createTransport: mockCreateTransport,
}));

describe("otp send api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockGenerateLink.mockReset();
    mockGetSupabaseServerEnv.mockReset();
    mockGetSupabaseServerForRequest.mockReset();
    mockListUsers.mockReset();
    mockRpc.mockReset();
    mockSendMail.mockReset();
    mockCreateTransport.mockReset();
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSendMail.mockResolvedValue({});
    process.env["BREVO_API_KEY"] = "YOUR_TEST_BREVO_KEY";
    process.env.NODEMAILER_HOST = "smtp.example.test";
    process.env.NODEMAILER_PORT = "587";
    process.env.NODEMAILER_USER = "test-user";
    process.env["NODEMAILER_PASS"] = "changeme";
    process.env.NODEMAILER_FROM = "security@example.test";
    global.fetch = jest.fn(
      async () => new Response("{}", { status: 201 }),
    ) as unknown as typeof fetch;

    mockGetSupabaseServerEnv.mockReturnValue({
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceKey: "service-role-key",
      selectedProfile: "core-production",
      usingDevFallback: false,
    });
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null });
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    mockGetSupabaseServerForRequest.mockReturnValue({
      auth: {
        admin: {
          generateLink: mockGenerateLink,
          listUsers: mockListUsers,
        },
      },
      from: jest.fn(() => createAccountLookupBuilder()),
      rpc: mockRpc,
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalBrevoApiKey === undefined) delete process.env["BREVO_API_KEY"];
    else process.env["BREVO_API_KEY"] = originalBrevoApiKey;
    if (originalNodemailerHost === undefined)
      delete process.env.NODEMAILER_HOST;
    else process.env.NODEMAILER_HOST = originalNodemailerHost;
    if (originalNodemailerPort === undefined)
      delete process.env.NODEMAILER_PORT;
    else process.env.NODEMAILER_PORT = originalNodemailerPort;
    if (originalNodemailerUser === undefined)
      delete process.env["NODEMAILER_USER"];
    else process.env["NODEMAILER_USER"] = originalNodemailerUser;
    if (originalNodemailerPass === undefined)
      delete process.env["NODEMAILER_PASS"];
    else process.env["NODEMAILER_PASS"] = originalNodemailerPass;
    if (originalNodemailerFrom === undefined)
      delete process.env.NODEMAILER_FROM;
    else process.env.NODEMAILER_FROM = originalNodemailerFrom;
  });

  it("lets an existing account save its first phone only after both proofs complete", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [verifiedPhoneAccount] },
      error: null,
    });
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          hashed_token: "existing-account-email-otp-token",
          verification_type: "magiclink",
        },
      },
      error: null,
    });
    const { POST } = require("../../../app/api/auth/otp+api");

    const response = await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "user@example.com",
          delivery: "sms",
          phone: "+573001112233",
        }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      flow: "phone-link",
      session: null,
      phoneBound: false,
    });
    expect(mockGenerateLink).toHaveBeenCalled();
  });

  it("limits an existing account to two trusted phones", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [verifiedPhoneAccount] },
      error: null,
    });
    const unboundPhone = createAccountLookupBuilder(null);
    const twoTrustedPhones = createAccountLookupBuilder([
      { id: "phone-one" },
      { id: "phone-two" },
    ]);
    mockGetSupabaseServerForRequest.mockReturnValue({
      auth: {
        admin: {
          generateLink: mockGenerateLink,
          listUsers: mockListUsers,
        },
      },
      from: jest
        .fn()
        .mockReturnValueOnce(unboundPhone)
        .mockReturnValueOnce(twoTrustedPhones),
      rpc: mockRpc,
    });
    const { POST } = require("../../../app/api/auth/otp+api");

    const response = await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: verifiedPhoneAccount.email,
          delivery: "sms",
          phone: "+573009998888",
        }),
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "trusted_phone_limit",
    });
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it("allows SMS login only for a verified phone already bound to the submitted account", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [verifiedPhoneAccount] },
      error: null,
    });
    mockGetSupabaseServerForRequest.mockReturnValue({
      auth: {
        admin: {
          generateLink: mockGenerateLink,
          listUsers: mockListUsers,
        },
      },
      from: jest.fn(() => createAccountLookupBuilder(verifiedPhoneAccount)),
      rpc: mockRpc,
    });
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          hashed_token: "sms-otp-token",
          verification_type: "magiclink",
        },
      },
      error: null,
    });

    const { POST } = require("../../../app/api/auth/otp+api");
    const response = await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: verifiedPhoneAccount.email,
          delivery: "sms",
          phone: verifiedPhoneAccount.phone,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGenerateLink).toHaveBeenCalled();
  });

  it("starts a new SMS-led registration without binding the phone or creating a session", async () => {
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          hashed_token: "new-account-email-otp-token",
          verification_type: "magiclink",
        },
      },
      error: null,
    });
    const { POST } = require("../../../app/api/auth/otp+api");

    const response = await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "new-user@example.com",
          delivery: "sms",
          phone: "+573009998888",
        }),
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      session: null,
      phoneBound: false,
    });
  });

  it("does not treat lookalike SMTP hosts as Brevo", async () => {
    process.env.NODEMAILER_HOST = "brevo.com.attacker.example";
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: {
          hashed_token: "email-otp-token",
          verification_type: "magiclink",
        },
      },
      error: null,
    });
    const { POST } = require("../../../app/api/auth/otp+api");

    await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", delivery: "email" }),
      }),
    );

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "brevo.com.attacker.example",
        tls: expect.objectContaining({
          servername: undefined,
        }),
      }),
    );
  });

  it("does not expose raw identity-provider database failures", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "Database error saving new user", status: 500 },
    });
    const { POST } = require("../../../app/api/auth/otp+api");

    const response = await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", delivery: "email" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ code: "auth_service_unavailable" });
    expect(JSON.stringify(payload)).not.toContain(
      "Database error saving new user",
    );
  });

  it("keeps an identity-provider client rejection a client error while sanitizing it", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "email address is not allowed", status: 422 },
    });
    const { POST } = require("../../../app/api/auth/otp+api");

    const response = await POST(
      new Request("https://api.hashpass.tech/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@example.com", delivery: "email" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({ code: "auth_request_rejected" });
    expect(JSON.stringify(payload)).not.toContain(
      "email address is not allowed",
    );
  });
});
