import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Support visitors are not Supabase auth users -- the widget can be embedded
 * anonymously with no login at all -- so they authenticate with an opaque
 * bearer token minted by POST /v1/support/sessions, not a Supabase JWT.
 * Sessions are not refreshable this phase: once expired, the client must
 * call createSupportSession()/identifySupportVisitor() again (see
 * packages/sdk/src/auth/client.ts's adoptSupportSession, which has no
 * refreshToken for support sessions for the same reason).
 */
export const SUPPORT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ResolvedSupportSession {
  sessionId: string;
  visitorId: string;
  appId: string;
}

export function generateSupportSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSupportSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appIdFromRequest(request: Request): string | null {
  const header = request.headers.get("x-hashpass-app-id");
  const normalized = header?.trim();
  return normalized || null;
}

function bearerTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Resolves the caller's support session from the Authorization header,
 * cross-checked against the x-hashpass-app-id header the SDK always sends
 * (see HttpTransport#send in packages/sdk/src/transport.ts). A session
 * minted for one app id is not honored under a different one, even though
 * the token itself is unguessable -- this is defense-in-depth against app-id
 * mixups, not the primary access control.
 */
export async function resolveSupportSession(
  supabase: SupabaseClient,
  request: Request,
): Promise<ResolvedSupportSession | null> {
  const token = bearerTokenFromRequest(request);
  if (!token) return null;

  const appId = appIdFromRequest(request);
  if (!appId) return null;

  const tokenHash = hashSupportSessionToken(token);
  const { data, error } = await supabase
    .from("support_sessions")
    .select("id, visitor_id, app_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.app_id !== appId) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  return { sessionId: data.id, visitorId: data.visitor_id, appId: data.app_id };
}

export function unauthorizedSupportResponse(message = "A valid support session is required"): Response {
  return Response.json({ message }, { status: 401 });
}
