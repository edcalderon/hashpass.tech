import { authorizeGlobalAdmin } from "@/lib/server/global-admin";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

export async function POST(request: Request) {
  const admin = await authorizeGlobalAdmin(request);
  if ("response" in admin) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const consume = body?.consume !== false;
  const scannerDeviceId = typeof body?.scannerDeviceId === "string" ? body.scannerDeviceId.trim() : null;
  if (!token) return json({ error: "A QR token is required" }, 400);

  const supabase = getSupabaseServerForRequest(request);
  if (consume) {
    const { data, error } = await supabase.rpc("validate_and_use_qr", {
      p_token: token,
      p_scanner_user_id: admin.userId,
      p_scanner_device_id: scannerDeviceId,
    });
    if (error || !data) {
      console.error("[qr] validation failed:", error);
      return json({ error: "Unable to validate the QR code" }, 503);
    }
    return json({ data });
  }

  const { data: qr, error } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) return json({ error: "Unable to check the QR code" }, 503);
  if (!qr) return json({ data: { valid: false, status: "invalid", message: "QR code not found" } });
  const expired = Boolean(qr.expires_at && new Date(qr.expires_at).getTime() <= Date.now());
  const exhausted = Number(qr.usage_count) >= Number(qr.max_uses);
  const valid = qr.status === "active" && !expired && !exhausted;
  return json({ data: {
    valid,
    status: valid ? "valid" : expired ? "expired" : exhausted || qr.status === "used" ? "already_used" : qr.status,
    message: valid ? "QR code is valid" : expired ? "QR code has expired" : exhausted || qr.status === "used" ? "This QR code has already been used" : `QR code is ${qr.status}`,
    qr_data: qr.qr_data,
    display_data: qr.display_data,
    usage_count: qr.usage_count,
    max_uses: qr.max_uses,
    expires_at: qr.expires_at,
  } });
}
