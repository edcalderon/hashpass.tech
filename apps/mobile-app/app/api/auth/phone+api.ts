import { randomUUID } from "crypto";
import {
  getSupabaseServerEnv,
  getSupabaseServerForRequest,
} from "../../../lib/supabase-server";
import {
  createEmailLookupHash,
  createPhoneLookupHash,
  createSmsChallengeCodeHash,
  createSmsCode,
  isE164Phone,
  normalizeE164Phone,
  sendTransactionalSms,
} from "../../../lib/server/sms-auth";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "../../../lib/server/resolve-notification-identity";
import {
  createCorsPreflightResponse,
  withCors,
} from "../../../lib/cors";

const corsOptions = {
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
} as const;

const json = (request: Request, body: unknown, status = 200) =>
  withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }),
    request,
    corsOptions,
  );

const validEmail = (value: unknown): value is string =>
  typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const validChallengeId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

async function authenticatedUserId(
  request: Request,
): Promise<{ userId: string } | { response: Response }> {
  // Enrollment changes a sign-in authenticator. Do not accept ambient cookies
  // for this mutation, even when the caller happens to have a web session.
  if (!/^Bearer\s+\S+$/i.test(request.headers.get("Authorization") || "")) {
    return { response: json(request, { error: "bearer_required" }, 401) };
  }

  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return { response: json(request, { error: identity.error }, identity.status) };
  }
  if (!identity.supabaseUserId) {
    return { response: json(request, { error: "linked_account_required" }, 403) };
  }
  return { userId: identity.supabaseUserId };
}

export async function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const actor = await authenticatedUserId(request);
  if ("response" in actor) return actor.response;

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from("user_phone_authenticators")
    .select("phone_last4, verified_at")
    .eq("user_id", actor.userId)
    .is("revoked_at", null)
    .order("verified_at", { ascending: true })
    .limit(2);

  if (error) return json(request, { error: "phone_authenticator_unavailable" }, 503);
  return json(request, {
    success: true,
    data: {
      phones: (data || []).map(
        (phone: { phone_last4: string; verified_at: string }) => ({
          last4: phone.phone_last4,
          verifiedAt: phone.verified_at,
        }),
      ),
    },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(request, { error: "invalid_json" }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json(request, { error: "invalid_json" }, 400);
  }

  const action = body?.action;
  const env = getSupabaseServerEnv(request);
  if (!env.supabaseServiceKey)
    return json(request, { error: "auth_service_unavailable" }, 503);
  const supabase = getSupabaseServerForRequest(request);

  if (action === "registration-verify") {
    const email = validEmail(body.email) ? body.email.trim().toLowerCase() : "";
    const challengeId = validChallengeId(body.challengeId)
      ? body.challengeId
      : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !challengeId || !/^\d{6}$/.test(code))
      return json(request, { error: "invalid_request" }, 400);

    const emailHash = createEmailLookupHash(env.supabaseServiceKey, email);
    const codeHash = createSmsChallengeCodeHash({
      serviceKey: env.supabaseServiceKey,
      challengeId,
      code,
      purpose: "registration",
    });
    const { data, error } = await supabase.rpc("consume_sms_auth_challenge", {
      p_challenge_id: challengeId,
      p_user_id: null,
      p_email_lookup_hmac: emailHash,
      p_code_hmac: codeHash,
      p_purpose: "registration",
    });

    if (error || !data?.ok)
      return json(request, { error: "invalid_or_expired_code" }, 400);
    return json(request, { success: true, data: { success: true, next: "email" } });
  }

  const actor = await authenticatedUserId(request);
  if ("response" in actor) return actor.response;

  if (action === "enroll-start") {
    const phone = normalizeE164Phone(body.phone);
    if (!isE164Phone(phone)) return json(request, { error: "invalid_phone" }, 400);

    const { data: userResult, error: userError } =
      await supabase.auth.admin.getUserById(actor.userId);
    const email = userResult?.user?.email?.trim().toLowerCase();
    if (userError || !email || !validEmail(email))
      return json(request, { error: "account_email_required" }, 403);

    const phoneHash = createPhoneLookupHash(env.supabaseServiceKey, phone);
    const { data: boundPhone, error: bindingError } = await supabase
      .from("user_phone_authenticators")
      .select("user_id")
      .eq("phone_lookup_hmac", phoneHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (bindingError)
      return json(request, { error: "phone_authenticator_unavailable" }, 503);
    if (boundPhone?.user_id && boundPhone.user_id !== actor.userId) {
      return json(request, { error: "phone_unavailable" }, 409);
    }

    const { data: activePhones, error: activePhonesError } = await supabase
      .from("user_phone_authenticators")
      .select("id")
      .eq("user_id", actor.userId)
      .is("revoked_at", null);
    if (activePhonesError)
      return json(request, { error: "phone_authenticator_unavailable" }, 503);
    if (Array.isArray(activePhones) && activePhones.length >= 2) {
      return json(
        request,
        {
          error: "trusted_phone_limit",
          message: "This account already has two trusted phones.",
        },
        409,
      );
    }

    const { data: deliveryAllowed, error: deliveryLimitError } =
      await supabase.rpc("claim_sms_delivery_slot", {
        p_phone_lookup_hmac: phoneHash,
      });
    if (deliveryLimitError)
      return json(request, { error: "phone_authenticator_unavailable" }, 503);
    if (!deliveryAllowed) {
      return json(
        request,
        {
          error: "sms_rate_limited",
          message: "Too many SMS requests. Please wait before trying again.",
        },
        429,
      );
    }

    const challengeId = randomUUID();
    const code = createSmsCode();
    const { error: insertError } = await supabase
      .from("sms_auth_challenges")
      .insert({
        id: challengeId,
        user_id: actor.userId,
        email_lookup_hmac: createEmailLookupHash(env.supabaseServiceKey, email),
        phone_lookup_hmac: phoneHash,
        phone_last4: phone.slice(-4),
        purpose: "enrollment",
        code_hmac: createSmsChallengeCodeHash({
          serviceKey: env.supabaseServiceKey,
          challengeId,
          code,
          purpose: "enrollment",
        }),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
    if (insertError)
      return json(request, { error: "phone_authenticator_unavailable" }, 503);

    const delivery = await sendTransactionalSms({ phone, code });
    if (!delivery.success)
      return json(
        request,
        { error: delivery.code, message: delivery.message },
        delivery.status,
      );
    return json(request, { success: true, data: { success: true, challengeId } });
  }

  if (action === "enroll-verify") {
    const challengeId = validChallengeId(body.challengeId)
      ? body.challengeId
      : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!challengeId || !/^\d{6}$/.test(code))
      return json(request, { error: "invalid_request" }, 400);

    const { data: userResult, error: userError } =
      await supabase.auth.admin.getUserById(actor.userId);
    const email = userResult?.user?.email?.trim().toLowerCase();
    if (userError || !email || !validEmail(email))
      return json(request, { error: "account_email_required" }, 403);

    const emailHash = createEmailLookupHash(env.supabaseServiceKey, email);
    const codeHash = createSmsChallengeCodeHash({
      serviceKey: env.supabaseServiceKey,
      challengeId,
      code,
      purpose: "enrollment",
    });
    const { data, error } = await supabase.rpc("consume_sms_auth_challenge", {
      p_challenge_id: challengeId,
      p_user_id: actor.userId,
      p_email_lookup_hmac: emailHash,
      p_code_hmac: codeHash,
      p_purpose: "enrollment",
    });
    if (error || !data?.ok)
      return json(request, { error: "invalid_or_expired_code" }, 400);

    const { error: bindingError } = await supabase
      .from("user_phone_authenticators")
      .upsert(
        {
          user_id: actor.userId,
          phone_lookup_hmac: data.phoneLookupHmac,
          phone_last4: data.phoneLast4,
          verified_at: new Date().toISOString(),
          revoked_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,phone_lookup_hmac" },
      );
    if (bindingError)
      return json(request, { error: "phone_authenticator_unavailable" }, 503);
    return json(request, {
      success: true,
      data: { success: true, last4: data.phoneLast4 },
    });
  }

  return json(request, { error: "invalid_action" }, 400);
}
