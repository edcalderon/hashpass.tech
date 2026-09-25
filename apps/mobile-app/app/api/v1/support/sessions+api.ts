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
// packages/sdk/src/support/client.ts. Empty-body session creation is anonymous;
// identity attachment requires a verified primary bearer token.
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
  const claimedIdentity = body?.identity ?? {};
  const identifiesVisitor = Object.keys(claimedIdentity).length > 0;

  const supabase = getSupabaseServerForRequest(request);
  let identity: Record<string, unknown> = {};
  if (identifiesVisitor) {
    const authorization = request.headers.get("authorization") ?? "";
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return Response.json({ message: "Authenticated identity required" }, { status: 401 });

    const { data: authData, error: authError } = await supabase.auth.getUser(bearer);
    const user = authData?.user;
    if (authError || !user?.id || !user.email) {
      return Response.json({ message: "Verified identity required" }, { status: 401 });
    }
    identity = {
      externalId: user.id,
      email: user.email,
      name: claimedIdentity.name ?? user.user_metadata?.name ?? null,
      locale: claimedIdentity.locale ?? null,
      traits: claimedIdentity.traits ?? null,
    };
  }

  const token = generateSupportSessionToken();
  const tokenHash = hashSupportSessionToken(token);
  const expiresAt = new Date(Date.now() + SUPPORT_SESSION_TTL_MS).toISOString();

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
