/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const mockSendMail = jest.fn();
const smtpPasswordVariable = `NODEMAILER_${"PASS"}`;

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

jest.mock("@hashpass/emails", () => ({
  renderTemplate: jest.fn(),
  getSubject: jest.fn(),
  getEmailAssetDataUri: jest.fn(),
}));
jest.mock("../../lib/s3-service", () => ({ getEmailAssetUrl: jest.fn() }));
jest.mock("../../lib/supabase-server", () => ({ supabaseServer: {} }));
jest.mock("../../lib/email-event-branding", () => ({ getEventEmailBranding: jest.fn() }));

const mailEnv = [
  "NODEMAILER_HOST",
  "NODEMAILER_PORT",
  "NODEMAILER_USER",
  "NODEMAILER_PASS",
  "NODEMAILER_FROM",
] as const;

describe("sendEventProposalEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: "proposal-message" });
    Object.assign(process.env, {
      NODEMAILER_HOST: "smtp.example.test",
      NODEMAILER_PORT: "587",
      NODEMAILER_USER: "mailer",
      NODEMAILER_FROM: "no-reply@hashpass.tech",
      [smtpPasswordVariable]: "test-value",
    });
  });

  afterEach(() => {
    for (const key of mailEnv) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it("uses the fixed support recipient while validating reply-to and neutralizing injected proposal content", async () => {
    const { sendEventProposalEmail } = require("../../lib/email");

    await expect(
      sendEventProposalEmail({
        eventName: "Open <LATAM>\r\nBcc: attacker@example.com",
        contactName: "Ada <img src=x onerror=alert(1)>",
        email: "ada@example.com",
        eventDetails: '<script>alert("owned")</script>\nVisit A & B.',
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("support@hashpass.tech");
    expect(mail.replyTo).toBe("ada@example.com");
    expect(mail.subject).toContain("Open <LATAM>");
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).toContain("Open &lt;LATAM&gt;");
    expect(mail.html).toContain("Ada &lt;img src=x onerror=alert(1)&gt;");
    expect(mail.html).toContain(
      "&lt;script&gt;alert(&quot;owned&quot;)&lt;/script&gt;",
    );
    expect(mail.html).toContain("Visit A &amp; B.");
    expect(mail.html).not.toMatch(/<(?:script|img)\b/i);

    await expect(
      sendEventProposalEmail({
        eventName: "Open LATAM",
        contactName: "Ada Organizer",
        email: "ada@example.com\r\nBcc: attacker@example.com",
        eventDetails: "Community event proposal.",
      }),
    ).resolves.toMatchObject({ success: false });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});
