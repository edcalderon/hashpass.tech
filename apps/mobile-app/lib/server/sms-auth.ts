import { createHmac, randomInt } from "crypto";
import type { SmsDeliveryResult } from "../../types/sms-auth.types";

const E164_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export const normalizeE164Phone = (value: unknown): string =>
  typeof value === "string" ? value.trim().replace(/[\s()-]/g, "") : "";

export const isE164Phone = (value: string): boolean =>
  E164_PHONE_PATTERN.test(value);

export const createSmsCode = (): string =>
  randomInt(0, 1_000_000).toString().padStart(6, "0");

const hash = (secret: string, value: string): string =>
  createHmac("sha256", secret).update(value).digest("hex");

export const createPhoneLookupHash = (
  serviceKey: string,
  phone: string,
): string => hash(serviceKey, `hashpass:sms-phone:v1:${phone}`);

export const createEmailLookupHash = (
  serviceKey: string,
  email: string,
): string => hash(serviceKey, `hashpass:sms-email:v1:${email}`);

export const createOtpCodeHash = ({
  serviceKey,
  email,
  code,
  purpose,
}: {
  serviceKey: string;
  email: string;
  code: string;
  purpose: string;
}): string =>
  hash(serviceKey, `hashpass:otp-code:v1:${purpose}:${email}:${code}`);

export const createSmsChallengeCodeHash = ({
  serviceKey,
  challengeId,
  code,
  purpose,
}: {
  serviceKey: string;
  challengeId: string;
  code: string;
  purpose: string;
}): string =>
  hash(
    serviceKey,
    `hashpass:sms-challenge:v1:${purpose}:${challengeId}:${code}`,
  );

/**
 * Sends only a short-lived, single-use authentication code. Phone ownership is
 * established separately by the challenge record; this function must never be
 * used as proof that an arbitrary phone belongs to an arbitrary account.
 */
export async function sendTransactionalSms({
  phone,
  code,
}: {
  phone: string;
  code: string;
}): Promise<SmsDeliveryResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    return {
      success: false,
      status: 503,
      code: "sms_not_configured",
      message: "SMS verification is temporarily unavailable.",
    };
  }

  const sender = (process.env.BREVO_SMS_SENDER || "HASHPASS")
    .trim()
    .slice(0, 11);
  try {
    // eslint-disable-next-line no-restricted-syntax
    const response = await fetch(
      "https://api.brevo.com/v3/transactionalSMS/send",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender,
          recipient: phone.slice(1),
          content: `HASHPASS verification code: ${code}. It expires in 10 minutes. Do not share it.`,
          type: "transactional",
        }),
      },
    );

    if (response.ok) return { success: true };

    const responseText = await response.text().catch(() => "");
    const isRateLimited =
      response.status === 429 || /rate|quota|limit/i.test(responseText);
    return {
      success: false,
      status: isRateLimited ? 429 : 502,
      code: isRateLimited ? "sms_rate_limited" : "sms_send_failed",
      message: isRateLimited
        ? "Too many SMS requests. Please wait before trying again."
        : "SMS verification is temporarily unavailable.",
    };
  } catch {
    return {
      success: false,
      status: 502,
      code: "sms_send_failed",
      message: "SMS verification is temporarily unavailable.",
    };
  }
}
