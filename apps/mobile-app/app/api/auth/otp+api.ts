import {
  getSupabaseServerEnv,
  getSupabaseServerForRequest,
} from "../../../lib/supabase-server";
import {
  createEmailLookupHash,
  createOtpCodeHash,
  createPhoneLookupHash,
  createSmsChallengeCodeHash,
  createSmsCode,
  isE164Phone,
  normalizeE164Phone,
  sendTransactionalSms,
} from "../../../lib/server/sms-auth";
import { randomUUID } from "crypto";
import * as nodemailer from "nodemailer";
import {
  createCorsPreflightResponse,
  getCorsHeaders,
} from "../../../lib/cors";

async function findSupabaseUserByEmailForSms(client: any, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) return { user: null, available: false };
    const users = data?.users || [];
    const user = users.find(
      (candidate: { email?: string }) =>
        candidate.email?.trim().toLowerCase() === email,
    );
    if (user) return { user, available: true };
    if (users.length < perPage) break;
  }
  return { user: null, available: true };
}

const corsOptions = {
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
} as const;

const corsHeaders = (request: Request) =>
  getCorsHeaders(request, corsOptions);

// Handle CORS preflight requests
export async function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

/**
 * API endpoint to send OTP code via custom email
 * Generates OTP token using Supabase Admin API and sends custom email with a 6-digit code
 */
export async function POST(request: Request) {
  try {
    // Handle JSON parsing errors
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error("Error parsing request body:", parseError);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          code: "invalid_json",
          message:
            "Please ensure the request body contains valid JSON with an email field.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    const { email, delivery: requestedDelivery, phone } = body || {};
    const delivery = requestedDelivery === "sms" ? "sms" : "email";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Valid email is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    const supabase = getSupabaseServerForRequest(request);
    // Check Supabase configuration before proceeding.
    const {
      supabaseUrl,
      supabaseServiceKey,
      usingDevFallback,
      selectedProfile,
    } = getSupabaseServerEnv(request);

    if (!supabaseUrl || !supabaseServiceKey) {
      const missingVars = [];
      if (!supabaseUrl) {
        missingVars.push(
          "Supabase public URL missing (dev fallback available)",
        );
      }
      if (!supabaseServiceKey) {
        missingVars.push(
          "Supabase service role key missing (dev fallback available)",
        );
      }

      console.error(
        "❌ OTP API: Missing environment variables:",
        missingVars.join(", "),
        "| selectedProfile=",
        selectedProfile,
        "| usingDevFallback=",
        usingDevFallback,
      );
      return new Response(
        JSON.stringify({
          error: "Server configuration error",
          code: "server_config_error",
          message:
            "Authentication service is not properly configured. Please contact support.",
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    {
      let supabaseHost = supabaseUrl;
      try {
        supabaseHost = new URL(supabaseUrl).hostname;
      } catch {
        // Keep raw value if URL parsing fails.
      }
      console.log(
        "ℹ️ OTP API Supabase target:",
        supabaseHost,
        "| profile=",
        selectedProfile,
        "| hasServiceKey=",
        Boolean(supabaseServiceKey),
        "| origin=",
        request.headers.get("origin") || "(none)",
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    let normalizedPhone = "";
    let phoneLookupHmac = "";
    let smsEnrollmentFlow: "registration" | "phone-link" | null = null;

    if (delivery === "sms") {
      normalizedPhone = normalizeE164Phone(phone);
      if (!isE164Phone(normalizedPhone)) {
        return new Response(
          JSON.stringify({
            error: "Valid phone is required in E.164 format.",
            code: "invalid_phone",
          }),
          {
            status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }

      phoneLookupHmac = createPhoneLookupHash(
        supabaseServiceKey,
        normalizedPhone,
      );
      const accountLookup = await findSupabaseUserByEmailForSms(
        supabase,
        normalizedEmail,
      );
      if (!accountLookup.available) {
        return new Response(
          JSON.stringify({
            error: "SMS verification is temporarily unavailable.",
            code: "sms_unavailable",
          }),
          {
            status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }
      const existingUser = accountLookup.user;

      if (existingUser) {
        const { data: phoneAuthenticator, error: phoneAuthenticatorError } =
          await supabase
            .from("user_phone_authenticators")
            .select("id")
            .eq("user_id", existingUser.id)
            .eq("phone_lookup_hmac", phoneLookupHmac)
            .is("revoked_at", null)
            .maybeSingle();

        if (phoneAuthenticatorError) {
          return new Response(
            JSON.stringify({
              error: "SMS verification is temporarily unavailable.",
              code: "sms_unavailable",
            }),
            {
              status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
            },
          );
        }

        // A first or second phone can be proposed from the sign-in screen,
        // but it remains unusable until the account email is proven too.
        if (!phoneAuthenticator) {
          const { data: activePhones, error: activePhonesError } =
            await supabase
              .from("user_phone_authenticators")
              .select("id")
              .eq("user_id", existingUser.id)
              .is("revoked_at", null);
          if (activePhonesError) {
            return new Response(
              JSON.stringify({
                error: "SMS verification is temporarily unavailable.",
                code: "sms_unavailable",
              }),
              {
                status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
              },
            );
          }
          if (Array.isArray(activePhones) && activePhones.length >= 2) {
            return new Response(
              JSON.stringify({
                error: "This account already has two trusted phones.",
                code: "trusted_phone_limit",
                message:
                  "Use one of the two phones already saved in Security settings.",
              }),
              {
                status: 409,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
              },
            );
          }

          smsEnrollmentFlow = "phone-link";
        }
      } else {
        // A new account may start through SMS, but it cannot receive a session
        // or a phone binding until the entered email address is also proven.
        const { data: existingBinding, error: bindingError } = await supabase
          .from("user_phone_authenticators")
          .select("id")
          .eq("phone_lookup_hmac", phoneLookupHmac)
          .is("revoked_at", null)
          .maybeSingle();
        if (bindingError) {
          return new Response(
            JSON.stringify({
              error: "SMS verification is temporarily unavailable.",
              code: "sms_unavailable",
            }),
            {
              status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
            },
          );
        }
        if (existingBinding) {
          return new Response(
            JSON.stringify({
              error: "SMS sign-in requires a verified phone.",
              code: "trusted_phone_required",
            }),
            {
              status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
            },
          );
        }
        smsEnrollmentFlow = "registration";
      }

      const { data: deliveryAllowed, error: deliveryLimitError } =
        await supabase.rpc("claim_sms_delivery_slot", {
          p_phone_lookup_hmac: phoneLookupHmac,
        });
      if (deliveryLimitError) {
        return new Response(
          JSON.stringify({
            error: "SMS verification is temporarily unavailable.",
            code: "sms_unavailable",
          }),
          {
            status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }
      if (!deliveryAllowed) {
        return new Response(
          JSON.stringify({
            error: "Too many SMS requests. Please wait before trying again.",
            code: "sms_rate_limited",
          }),
          {
            status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }
    }

    // Use Supabase Admin API to generate OTP token
    let linkData, linkError;
    try {
      const result = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: email.trim(),
      });
      linkData = result.data;
      linkError = result.error;
    } catch (supabaseError: any) {
      console.error("❌ Supabase connection error:", supabaseError);

      // Check if it's a configuration error
      if (
        supabaseError?.message?.includes(
          "Missing Supabase environment variables",
        ) ||
        supabaseError?.message?.includes("SUPABASE_SERVICE_ROLE_KEY")
      ) {
        return new Response(
          JSON.stringify({
            error: "Server configuration error",
            code: "server_config_error",
            message:
              "Authentication service is not properly configured. Please contact support.",
          }),
          {
            status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }

      // Check if it's a network error
      if (
        supabaseError?.message?.includes("network") ||
        supabaseError?.message?.includes("fetch") ||
        supabaseError?.message?.includes("connection")
      ) {
        return new Response(
          JSON.stringify({
            error: "Network connection error",
            code: "network_error",
            message:
              "Authentication requires network connection. Please check your internet connection and try again.",
          }),
          {
            status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }

      // Re-throw to be handled by the error handling below
      linkError = supabaseError;
    }

    if (linkError || !linkData) {
      const errorStatus = (linkError as any)?.status || 0;
      // 401 usually means the service role key doesn't match the Supabase project URL.
      // Check: EXPO_PUBLIC_SUPABASE_URL_PROD / BSL_SUPABASE_SERVICE_ROLE_KEY_PROD in Lambda env.
      console.error(
        "❌ OTP generateLink failed:",
        JSON.stringify(linkError, null, 2),
        "| supabaseUrl=",
        supabaseUrl,
        "| profile=",
        selectedProfile,
        "| httpStatus=",
        errorStatus,
      );

      // Check for rate limit errors specifically - check multiple possible formats
      const errorMessage = linkError?.message || "";
      const errorCode = linkError?.code || "";

      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("over_email_send_rate_limit") ||
        errorMessage.includes("email rate limit") ||
        errorCode === "over_email_send_rate_limit" ||
        errorCode === "rate_limit_exceeded" ||
        errorStatus === 429
      ) {
        console.log("Rate limit detected, returning 429");
        return new Response(
          JSON.stringify({
            error: "Email rate limit exceeded",
            code: "over_email_send_rate_limit",
            message:
              "Too many emails sent. Please wait a few minutes before requesting another code.",
          }),
          {
            status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }

      // A 401 here means the service role is not accepted by the configured
      // Supabase project, which is an upstream configuration outage. Other
      // 4xx responses are request/policy rejections and must remain client
      // errors for callers and monitoring, without exposing provider details.
      const isClientAuthRejection =
        errorStatus >= 400 && errorStatus < 500 && errorStatus !== 401;
      const responseStatus = isClientAuthRejection ? errorStatus : 503;

      return new Response(
        JSON.stringify(
          isClientAuthRejection
            ? {
                error: "Authentication request rejected",
                code: "auth_request_rejected",
                message:
                  "This sign-in request cannot be processed. Check your email address or use another sign-in method.",
              }
            : {
                error: "Authentication service unavailable",
                code: "auth_service_unavailable",
                message:
                  "We could not start your sign-in request. Please try again shortly.",
              },
        ),
        {
          status: responseStatus,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    // Extract token hash and verification type from generated link payload.
    const verificationTypeRaw = linkData.properties?.verification_type;
    const verificationType =
      typeof verificationTypeRaw === "string" && verificationTypeRaw.trim()
        ? verificationTypeRaw.trim()
        : "magiclink";

    let tokenHash =
      typeof linkData.properties?.hashed_token === "string"
        ? linkData.properties.hashed_token.trim()
        : "";

    // email_otp is the raw token that GoTrue's { email, token, type } path accepts.
    // This is more reliable than hashed_token + token_hash path across GoTrue versions.
    const emailOtp =
      typeof linkData.properties?.email_otp === "string"
        ? linkData.properties.email_otp.trim()
        : "";

    // Backward-compatible fallback: parse from action_link if hashed_token is absent.
    if (!tokenHash && linkData.properties?.action_link) {
      const linkUrl = new URL(linkData.properties.action_link);
      tokenHash =
        linkUrl.searchParams.get("token_hash") ||
        linkUrl.searchParams.get("token") ||
        "";
    }

    if (!tokenHash && !emailOtp) {
      console.error("Could not extract token hash from generated link");
      return new Response(
        JSON.stringify({ error: "Failed to extract OTP token" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    // Encode verification type + token hash + raw email_otp so the verify endpoint
    // can try both GoTrue paths: { email, token, type } and { token_hash, type }.
    const encodedTokenHash = emailOtp
      ? `${verificationType}::${tokenHash}::${emailOtp}`
      : `${verificationType}::${tokenHash}`;

    // A CSPRNG-generated code is stored as a keyed verifier rather than in
    // plaintext. The HMAC binds it to this email and flow, so a leaked DB row
    // cannot be used to complete sign-in without the server secret.
    const otpCode = createSmsCode();

    // Clean up expired OTP codes
    await supabase.rpc("cleanup_expired_otp_codes");

    // Invalidate a previous active email challenge for this account before
    // issuing a new one. This prevents an older code from remaining usable.
    await supabase
      .from("otp_codes")
      .update({ used: true } as any)
      .eq("email", normalizedEmail)
      .eq("purpose", "email-login")
      .eq("used", false);

    // Store only a keyed verifier; the raw code is never persisted.
    const { error: storeError } = await supabase.from("otp_codes").insert({
      email: normalizedEmail,
      code_hmac: createOtpCodeHash({
        serviceKey: supabaseServiceKey,
        email: normalizedEmail,
        code: otpCode,
        purpose: "email-login",
      }),
      purpose: "email-login",
      token_hash: encodedTokenHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used: false,
    } as any);

    if (storeError) {
      console.error("Error storing OTP code:", storeError);
      if (
        storeError.code === "PGRST205" ||
        storeError.code === "PGRST204" ||
        /code_hmac|purpose/i.test(storeError.message || "")
      ) {
        return new Response(
          JSON.stringify({
            error: "OTP security storage is not ready in this environment.",
            code: "otp_storage_migration_required",
            message:
              "The OTP security migration has not been applied to the active database. Please contact support.",
          }),
          {
            status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: "Could not store OTP code",
          code: storeError.code || "otp_storage_failed",
          message:
            storeError.message ||
            "Failed to persist OTP code. Please try again.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    let registrationChallengeId: string | null = null;
    let smsCode = otpCode;
    if (smsEnrollmentFlow) {
      registrationChallengeId = randomUUID();
      smsCode = createSmsCode();
      const { error: registrationError } = await supabase
        .from("sms_auth_challenges")
        .insert({
          id: registrationChallengeId,
          email_lookup_hmac: createEmailLookupHash(
            supabaseServiceKey,
            normalizedEmail,
          ),
          phone_lookup_hmac: phoneLookupHmac,
          phone_last4: normalizedPhone.slice(-4),
          purpose: "registration",
          code_hmac: createSmsChallengeCodeHash({
            serviceKey: supabaseServiceKey,
            challengeId: registrationChallengeId,
            code: smsCode,
            purpose: "registration",
          }),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
      if (registrationError) {
        return new Response(
          JSON.stringify({
            error: "SMS verification is temporarily unavailable.",
            code: "sms_unavailable",
          }),
          {
            status: 503,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }
    }

    // A first-time phone link deliberately sends an independent code to each
    // channel. Both must be verified before the phone is bound to the account.
    if (delivery === "email" || smsEnrollmentFlow) {
      const emailEnabled =
        process.env.NODEMAILER_HOST &&
        process.env.NODEMAILER_PORT &&
        process.env.NODEMAILER_USER &&
        process.env.NODEMAILER_PASS &&
        process.env.NODEMAILER_FROM;

      if (!emailEnabled) {
        return new Response(
          JSON.stringify({
            error:
              "Email service not configured. Please configure NODEMAILER settings.",
            code: "email_not_configured",
          }),
          {
            status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }

      const smtpHost = process.env.NODEMAILER_HOST || "";
      const normalizedSmtpHost = smtpHost
        .trim()
        .toLowerCase()
        .replace(/\.$/, "")
        .split(":")[0];
      const isBrevo =
        normalizedSmtpHost === "brevo.com" ||
        normalizedSmtpHost.endsWith(".brevo.com") ||
        normalizedSmtpHost === "sendinblue.com" ||
        normalizedSmtpHost.endsWith(".sendinblue.com");

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(process.env.NODEMAILER_PORT || "587"),
        secure: false,
        auth: {
          user: process.env.NODEMAILER_USER,
          pass: process.env.NODEMAILER_PASS,
        },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === "production",
          // Brevo serves region-specific relay certificates: some edges still
          // present only the legacy sendinblue.com names while others present
          // only brevo.com names, so no single hostname validates everywhere
          // (this broke OTP delivery in Oct 2026 when the relay stopped
          // matching the sendinblue hostname). Keep the CA chain check and
          // skip only the hostname match for Brevo; the account credentials
          // protect the relay.
          ...(isBrevo ? { checkServerIdentity: () => undefined } : {}),
        },
        requireTLS: true,
      });

      const mailOptions = {
        from: `HASHPASS <${process.env.NODEMAILER_FROM}>`,
        to: email.trim(),
        subject: `HASHPASS login code: ${otpCode}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4f46e5;">One-Time Login Code</h2>
            <p><strong>${otpCode}</strong> is your HASHPASS login code.</p>
            <p>Please enter this code to sign in:</p>
            <div style="background-color: #f3f4f6; border: 2px solid #4f46e5; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #4f46e5; font-size: 32px; letter-spacing: 8px; margin: 0;">${otpCode}</h1>
            </div>
            <p style="color: #6b7280; font-size: 14px;">This code will expire in 10 minutes.</p>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              © ${new Date().getFullYear()} HASHPASS. All rights reserved.
            </p>
          </div>
        `,
        text: `${otpCode} is your HASHPASS login code.\n\nPlease enter this code to sign in.\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log("OTP email sent successfully to:", email);
      } catch (emailError: any) {
        console.error("Error sending OTP email:", emailError);

        // Check for rate limit errors from SMTP provider
        if (
          emailError?.code === "EENVELOPE" ||
          emailError?.responseCode === 550 ||
          emailError?.message?.includes("rate limit") ||
          emailError?.message?.includes("quota") ||
          emailError?.message?.includes("too many")
        ) {
          return new Response(
            JSON.stringify({
              error: "Email rate limit exceeded",
              code: "over_email_send_rate_limit",
              message:
                "Too many emails sent. Please wait a few minutes before requesting another code.",
            }),
            {
              status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "Failed to send OTP email",
            code: "email_send_failed",
            message:
              emailError?.message ||
              "Could not send email. Please try again later.",
          }),
          {
            status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }
    }

    if (delivery === "sms") {
      const smsDelivery = await sendTransactionalSms({
        phone: normalizedPhone,
        code: smsCode,
      });
      if (!smsDelivery.success) {
        return new Response(
          JSON.stringify({
            error: smsDelivery.message,
            code: smsDelivery.code,
          }),
          {
            status: smsDelivery.status,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
          },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        delivery,
        flow: smsEnrollmentFlow || "sign-in",
        registrationChallengeId,
        session: null,
        phoneBound: false,
        message:
          delivery === "sms"
            ? "OTP code sent by SMS"
            : "OTP code sent to email",
      }),
      {
        status: smsEnrollmentFlow ? 202 : 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(request),
        },
      },
    );
  } catch (error: any) {
    console.error("OTP generation error:", error);

    // Check for rate limit errors in the catch block as well
    if (
      error?.message?.includes("rate limit") ||
      error?.message?.includes("over_email_send_rate_limit") ||
      error?.code === "over_email_send_rate_limit" ||
      error?.status === 429
    ) {
      return new Response(
        JSON.stringify({
          error: "Email rate limit exceeded",
          code: "over_email_send_rate_limit",
          message:
            "Too many emails sent. Please wait a few minutes before requesting another code.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to send OTP",
        code: error.code || "unknown_error",
      }),
      {
        status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders(request) },
      },
    );
  }
}
