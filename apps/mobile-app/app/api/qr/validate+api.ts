import { authorizeGlobalAdmin } from "@/lib/server/global-admin";
import { getEventSupabaseProfileIdForRequest } from "@/lib/server/event-supabase-profile";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

export async function POST(request: Request) {
  const profileId = getEventSupabaseProfileIdForRequest(request);
  const admin = await authorizeGlobalAdmin(request, profileId);
  if ("response" in admin) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const consume = body?.consume !== false;
  const scannerDeviceId = typeof body?.scannerDeviceId === "string" ? body.scannerDeviceId.trim() : null;
  if (!token) return json({ error: "A QR token is required" }, 400);

  const supabase = getSupabaseServerForRequest(request, profileId);
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
  const exhausted = Number(qr.usage_count) >= Number(qr.max_uses);
  let passStatus: string | null = null;
  let passMessage: string | null = null;

  if (qr.status === "active" && qr.qr_type === "pass" && !exhausted) {
    if (typeof qr.pass_id !== "string" || !qr.pass_id) {
      passStatus = "invalid";
      passMessage = "Pass QR code is not linked to a pass";
    } else {
      const { data: pass, error: passError } = await supabase
        .from("passes")
        .select("status, event_id")
        .eq("id", qr.pass_id)
        .maybeSingle();
      if (passError) return json({ error: "Unable to check the pass" }, 503);
      if (!pass) {
        passStatus = "invalid";
        passMessage = "Pass not found";
      } else if (pass.status !== "active") {
        passStatus = pass.status === "expired" ? "expired" : "revoked";
        passMessage = `Pass is ${pass.status}`;
      } else if (typeof pass.event_id === "string") {
        const { data: event, error: eventError } = await supabase
          .from("events")
          .select("ends_at")
          .eq("id", pass.event_id)
          .maybeSingle();
        if (eventError) return json({ error: "Unable to check the event" }, 503);
        if (!event) {
          passStatus = "invalid";
          passMessage = "Pass event not found";
        } else if (event.ends_at && new Date(event.ends_at).getTime() <= Date.now()) {
          passStatus = "expired";
          passMessage = "Pass event has ended";
        }
      } else {
        passStatus = "invalid";
        passMessage = "Pass event not found";
      }
    }
  }

  const expired = Boolean(qr.expires_at && new Date(qr.expires_at).getTime() <= Date.now())
    || passStatus === "expired";
  const valid = qr.status === "active" && !expired && !exhausted && !passStatus;
  const status = valid
    ? "valid"
    : expired
      ? "expired"
      : passStatus ?? (exhausted || qr.status === "used" ? "already_used" : qr.status);
  const message = valid
    ? "QR code is valid"
      : expired
      ? passStatus === "expired" ? passMessage : "QR code has expired"
      : passStatus
        ? passMessage
        : exhausted || qr.status === "used"
          ? "This QR code has already been used"
          : `QR code is ${qr.status}`;
  return json({ data: {
    valid,
    status,
    message,
    qr_data: qr.qr_data,
    display_data: qr.display_data,
    usage_count: qr.usage_count,
    max_uses: qr.max_uses,
    expires_at: qr.expires_at,
  } });
}
