import { getSupabaseServerForRequest } from "../../../lib/supabase-server";
import { normalizeMagicLinkRedirect } from "../../../lib/auth/magic-link-request";
import { sendAuthenticationMagicLink } from "../../../lib/email";
import { rateLimitOk } from "../../../lib/bsl/rateLimit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const clientIpFromRequest = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip")?.trim() ||
  "unknown";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Delivers passwordless sign-in links through the HashPass backend. The
 * browser never contacts Supabase Auth directly: this route mints the
 * single-use GoTrue verification URL and sends it through the configured
 * transactional SMTP provider.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body", code: "invalid_json" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const redirectTo = normalizeMagicLinkRedirect(body.redirectTo);
  const locale = typeof body.locale === "string" ? body.locale : "en";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "A valid email is required", code: "invalid_email" }, 400);
  }

  if (!redirectTo) {
    return json({ error: "Invalid sign-in callback", code: "invalid_redirect" }, 400);
  }

  // Guard both a sender and a recipient. The recipient guard also prevents a
  // new request from continually invalidating a user's outstanding link.
  const clientIp = clientIpFromRequest(request);
  if (
    !rateLimitOk(`magic-link:ip:${clientIp}`) ||
    !rateLimitOk(`magic-link:email:${email}`)
  ) {
    return json(
      { error: "Please wait before requesting another link", code: "rate_limited" },
      429,
    );
  }

  try {
    const supabase = getSupabaseServerForRequest(request);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
        data: { locale },
      },
    });

    const tokenHash = data?.properties?.hashed_token;
    const verificationType = data?.properties?.verification_type || "magiclink";
    if (error || !tokenHash) {
      const status = (error as { status?: number } | null)?.status === 429 ? 429 : 502;
      return json(
        {
          error: status === 429 ? "Please wait before requesting another link" : "Could not create sign-in link",
          code: status === 429 ? "rate_limited" : "magic_link_generation_failed",
        },
        status,
      );
    }

    // Email GoTrue's raw `action_link` instead and an email security
    // scanner/prefetcher (Outlook Safe Links, corporate mail gateways) that
    // fetches it before the user opens the message would silently consume
    // the single-use token, producing an otp_expired error for the real
    // click. token_hash is only resolved into a session by client-side JS
    // (createSessionFromUrl -> supabase.auth.verifyOtp), which a passive
    // prefetch never runs.
    const confirmationUrl = new URL(redirectTo);
    confirmationUrl.searchParams.set("token_hash", tokenHash);
    confirmationUrl.searchParams.set("type", verificationType);

    const delivery = await sendAuthenticationMagicLink({
      email,
      actionLink: confirmationUrl.toString(),
      locale,
    });
    if (!delivery.success) {
      return json(
        { error: "Could not send sign-in email", code: delivery.code },
        delivery.code === "email_not_configured" ? 503 : 502,
      );
    }

    return json({ success: true, message: "Sign-in link sent" }, 200);
  } catch (error) {
    console.error(
      "[auth] Magic link delivery failed:",
      error instanceof Error ? error.message : String(error),
    );
    return json({ error: "Could not send sign-in email", code: "magic_link_send_failed" }, 502);
  }
}
