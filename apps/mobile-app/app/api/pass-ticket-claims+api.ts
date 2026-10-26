import { createHash } from "node:crypto";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const ISSUER_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function GET(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return json({ error: identity.error }, identity.status);
  if (!identity.supabaseUserId) return json({ error: "A linked pass account is required" }, 403);
  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from("external_ticket_claims")
    .select("id,event_id,issuer,ticket_code_last4,source_ticket_metadata,requested_pass_type,status,reviewer_note,hashpass_pass_id,submitted_at,reviewed_at,converted_at")
    .eq("claimant_user_id", identity.supabaseUserId)
    .order("submitted_at", { ascending: false });
  if (error) return json({ error: "Unable to load ticket claims" }, 503);
  return json({ data: data || [] });
}

export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return json({ error: identity.error }, identity.status);
  if (!identity.supabaseUserId) return json({ error: "A linked pass account is required" }, 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
  const issuer = typeof body?.issuer === "string" ? body.issuer.trim().toLowerCase() : "blockchain_summit_latam";
  let ticketCode = typeof body?.ticketCode === "string" ? body.ticketCode.trim().toUpperCase() : "";
  const qrPayload = typeof body?.qrPayload === "string" ? body.qrPayload.trim() : "";
  // Some ticketing QRs carry nothing we can read as a reference. The payload
  // itself still identifies the ticket, so derive a stable reference from it.
  if (!ticketCode && qrPayload) ticketCode = digest(qrPayload).slice(0, 24).toUpperCase();
  const requestedPassType = typeof body?.requestedPassType === "string" ? body.requestedPassType.trim().toLowerCase() : "general";
  if (!EVENT_ID_PATTERN.test(eventId)) return json({ error: "A valid event is required" }, 400);
  if (!ISSUER_PATTERN.test(issuer)) return json({ error: "A valid ticket issuer is required" }, 400);
  if (ticketCode.length < 4 || ticketCode.length > 128) return json({ error: "The original ticket code is required" }, 400);
  if (!["general", "business", "vip"].includes(requestedPassType)) return json({ error: "Invalid requested pass type" }, 400);

  const supabase = getSupabaseServerForRequest(request);
  // Manual codes are only unique within an issuer and event. Keep that scope
  // in the fallback fingerprint so equal codes from different ticket systems
  // cannot collide in the globally unique QR-proof column.
  const sourceQrDigest = qrPayload
    ? digest(qrPayload)
    : `manual:${digest(JSON.stringify([issuer, eventId, ticketCode]))}`;
  const { data, error } = await supabase.rpc("submit_external_ticket_claim", {
    p_user_id: identity.supabaseUserId,
    p_event_id: eventId,
    p_issuer: issuer,
    p_ticket_code: ticketCode,
    p_source_qr_digest: sourceQrDigest,
    p_source_qr_payload: qrPayload
      ? { raw: qrPayload.slice(0, 4096), format: "external_ticket_qr" }
      : { format: "manual_ticket_code" },
    p_source_ticket_metadata: typeof body?.ticketMetadata === "object" && body.ticketMetadata ? body.ticketMetadata : {},
    p_requested_pass_type: requestedPassType,
  });
  if (error) {
    if (error.code === "23505" || /already been claimed/i.test(error.message || "")) {
      return json({ error: "This original ticket has already been claimed by another account" }, 409);
    }
    console.error("[ticket-claim] submit failed:", error);
    return json({ error: "Unable to submit the ticket claim" }, 503);
  }
  return json({ data });
}
