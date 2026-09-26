import cap from "@/lib/cap-instance";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { sendEventProposalEmail } from "@/lib/email";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanSingleLine = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
    : "";

const cleanDetails = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(/\t/g, " ")
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
        .replace(/[^\S\n]+/g, " ")
        .replace(/ *\n */g, "\n")
        .trim()
    : "";

const jsonError = (error: string, status: number, extra?: Record<string, unknown>) =>
  Response.json({ success: false, error, ...extra }, { status });

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`event-proposals:ip:${ip}`)) {
    return jsonError("Too many requests", 429);
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonError("Content-Type must be application/json", 400);
  }

  const body = await request.json().catch(() => null);
  const eventName = cleanSingleLine(body?.eventName);
  const contactName = cleanSingleLine(body?.contactName);
  const email = cleanSingleLine(body?.email).toLowerCase();
  const eventDetails = cleanDetails(body?.eventDetails);
  const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken.trim() : "";

  if (
    !eventName ||
    eventName.length > 160 ||
    !contactName ||
    contactName.length > 120 ||
    !email ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    !eventDetails ||
    eventDetails.length > 5_000 ||
    !captchaToken ||
    captchaToken.length > 2_048
  ) {
    return jsonError("Invalid event proposal", 400);
  }

  if (!rateLimitOk(`event-proposals:email:${email}`)) {
    return jsonError("Too many requests", 429);
  }

  let captchaValid = false;
  try {
    captchaValid = (await cap.validateToken(captchaToken)).success;
  } catch {
    captchaValid = false;
  }
  if (!captchaValid) {
    return jsonError("Security check expired. Please try again.", 400, {
      captchaExpired: true,
    });
  }

  const delivery = await sendEventProposalEmail({
    eventName,
    contactName,
    email,
    eventDetails,
  });
  if (!delivery.success) {
    console.error("[event-proposals] email delivery failed:", delivery.error);
    return jsonError("Unable to deliver event proposal", 502, {
      code: "proposal_email_failed",
    });
  }

  return Response.json({ success: true }, { status: 201 });
}
