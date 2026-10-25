import { createHash, randomBytes } from "node:crypto";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const PASS_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/;

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Authorization",
    },
  });

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const authenticatedUser = async (request: Request) => {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return { response: json({ error: identity.error }, identity.status) };
  if (!identity.supabaseUserId) {
    return { response: json({ error: "Your account is still being connected. Please try again." }, 409) };
  }
  return { userId: identity.supabaseUserId };
};

export async function POST(request: Request) {
  const auth = await authenticatedUser(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const passId = typeof body?.passId === "string" ? body.passId.trim() : "";
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  if (!PASS_ID_PATTERN.test(passId) || !eventId || eventId.length > 100) {
    return json({ error: "A valid pass and event are required" }, 400);
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data: pass, error } = await supabase
    .from("passes")
    .select("id,event_id,pass_type,status")
    .eq("id", passId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) {
    console.error("[pass-share] pass lookup failed:", error.message);
    return json({ error: "Unable to verify your pass" }, 503);
  }
  if (!pass || pass.status !== "active") return json({ error: "An active pass is required" }, 403);
  if (pass.event_id !== eventId) return json({ error: "The pass does not belong to this event" }, 409);

  const token = randomBytes(32).toString("base64url");
  const { data: created, error: insertError } = await supabase
    .from("pass_public_shares")
    .insert({
      pass_id: String(pass.id),
      event_id: String(pass.event_id),
      owner_user_id: auth.userId,
      token_hash: tokenHash(token),
    })
    .select("id,expires_at")
    .single();
  if (insertError || !created) {
    console.error("[pass-share] share creation failed:", insertError?.message);
    return json({ error: "Unable to create a public pass link" }, 503);
  }

  const url = `https://hpass.id/p/${encodeURIComponent(token)}`;
  return json({ data: { shareId: created.id, url, qrValue: url, expiresAt: created.expires_at || null } }, 201);
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!TOKEN_PATTERN.test(token)) return json({ error: "A valid public pass link is required" }, 400);
  const supabase = getSupabaseServerForRequest(request);
  const { data: share, error: shareError } = await supabase
    .from("pass_public_shares")
    .select("pass_id,event_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (shareError) {
    console.error("[pass-share] public lookup failed:", shareError.message);
    return json({ error: "Unable to load this public pass" }, 503);
  }
  if (!share || share.revoked_at || (share.expires_at && new Date(share.expires_at).getTime() <= Date.now())) {
    return json({ error: "This public pass link is no longer available" }, 404);
  }
  const { data: pass, error: passError } = await supabase
    .from("passes")
    .select("event_id,pass_type,status")
    .eq("id", share.pass_id)
    .eq("event_id", share.event_id)
    .maybeSingle();
  if (passError) return json({ error: "Unable to load this public pass" }, 503);
  if (!pass || pass.status !== "active") return json({ error: "This pass is no longer active" }, 404);
  return json({
    data: {
      eventId: pass.event_id,
      passType: pass.pass_type,
      status: pass.status,
      // Public details intentionally exclude pass number, owner identity,
      // internal ids and admission QR material.
    },
  });
}
