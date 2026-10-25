import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { authorizeGlobalAdmin } from "@/lib/server/global-admin";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

async function canReadQr(request: Request, ownerId: string, identityId: string) {
  if (ownerId === identityId) return true;
  const admin = await authorizeGlobalAdmin(request);
  return !('response' in admin);
}

export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return json({ error: identity.error }, identity.status);
  if (!identity.supabaseUserId) return json({ error: "A linked pass account is required" }, 403);

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const token = url.searchParams.get("token")?.trim();
  const passId = url.searchParams.get("passId")?.trim();
  const owner = url.searchParams.get("owner") === "true";
  const supabase = getSupabaseServerForRequest(request);

  if (!id && !token && !passId && !owner) return json({ error: "A QR id, token, pass id, or owner scope is required" }, 400);

  if (id || token) {
    let query = supabase.from("qr_codes").select("*");
    query = id ? query.eq("id", id) : query.eq("token", token);
    const { data: qr, error } = await query.maybeSingle();
    if (error) return json({ error: "Unable to load the QR code" }, 503);
    if (!qr) return json({ error: "QR code not found" }, 404);
    if (!(await canReadQr(request, String(qr.user_id), identity.supabaseUserId))) {
      return json({ error: "You do not have access to this QR code" }, 403);
    }
    return json({ data: qr });
  }

  let query = supabase
    .from("qr_codes")
    .select("*")
    .eq("user_id", identity.supabaseUserId);
  if (passId) query = query.eq("pass_id", passId);
  const { data: rows, error } = await query
    .order("generated_at", { ascending: false });
  if (error) return json({ error: "Unable to load pass QR codes" }, 503);
  return json({ data: rows || [] });
}
