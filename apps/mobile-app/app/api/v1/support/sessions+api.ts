import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { isKnownSupportApp } from "@/lib/server/support-apps";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import {
  SUPPORT_SESSION_TTL_MS,
  appIdFromRequest,
  generateSupportSessionToken,
  hashSupportSessionToken,
} from "@/lib/server/support-session";

// Serves both SupportClient.createSupportSession() (empty body) and
// identifySupportVisitor(identity) (body: { identity }) -- see
// packages/sdk/src/support/client.ts. Anonymous by design: this is the
// widget's boot-time call, before any visitor identity is known.
export async function POST(request: Request) {
  const appId = appIdFromRequest(request);
  if (!appId || !isKnownSupportApp(appId)) {
    return Response.json({ message: "Unknown or missing x-hashpass-app-id" }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimitOk(`support-session:${ip}`)) {
    return Response.json({ message: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const identity = body?.identity ?? {};

  const token = generateSupportSessionToken();
  const tokenHash = hashSupportSessionToken(token);
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_TTL_MS).toISOString();

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase.rpc("create_support_session", {
    p_app_id: appId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_external_id: identity.externalId ?? null,
    p_email: identity.email ?? null,
    p_name: identity.name ?? null,
    p_locale: identity.locale ?? null,
    p_traits: identity.traits ?? null,
  });

  if (error || !data?.[0]) {
    console.error("[support/sessions] create_support_session failed:", error?.message);
    return Response.json({ message: "Unable to create support session" }, { status: 500 });
  }

  const [row] = data;
  return Response.json(
    {
      token,
      visitorId: row.visitor_id,
      applicationId: appId,
      expiresAt,
    },
    { status: 200 },
  );
}
