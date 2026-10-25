import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { authorizeGlobalAdmin } from "@/lib/server/global-admin";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return json({ error: identity.error }, identity.status);
  if (!identity.supabaseUserId) return json({ error: "A linked pass account is required" }, 403);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const passId = typeof body?.passId === "string" ? body.passId.trim() : "";
  const expiresInMinutes = Number.isFinite(Number(body?.expiresInMinutes)) ? Number(body?.expiresInMinutes) : 30;
  const maxUses = Number.isFinite(Number(body?.maxUses)) ? Number(body?.maxUses) : 1;
  if (!passId) return json({ error: "A pass id is required" }, 400);

  const supabase = getSupabaseServerForRequest(request);
  const { data: pass, error: passError } = await supabase
    .from("passes")
    .select("id,user_id,status")
    .eq("id", passId)
    .maybeSingle();
  if (passError) return json({ error: "Unable to verify the pass" }, 503);
  if (!pass || pass.status !== "active") return json({ error: "An active pass is required" }, 403);

  if (String(pass.user_id) !== identity.supabaseUserId) {
    const admin = await authorizeGlobalAdmin(request);
    if ("response" in admin) return json({ error: "You do not own this pass" }, 403);
  }

  const { data: qrId, error } = await supabase.rpc("generate_pass_qr", {
    p_pass_id: passId,
    p_expires_in_minutes: Math.min(Math.max(Math.floor(expiresInMinutes), 1), 1440),
    p_max_uses: Math.min(Math.max(Math.floor(maxUses), 1), 25),
  });
  if (error || !qrId) {
    console.error("[qr] pass QR generation failed:", error);
    return json({ error: "Unable to generate a pass QR" }, 503);
  }

  const { data: qr, error: qrError } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("id", qrId)
    .single();
  if (qrError || !qr) return json({ error: "Pass QR was created but could not be loaded" }, 503);
  return json({ data: qr });
}
