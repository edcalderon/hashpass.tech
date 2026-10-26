import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import { createHash } from "node:crypto";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const ISSUER_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const REASONS = new Set(["impersonation", "stolen", "duplicate", "other"]);
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

/**
 * A person who holds an original ticket reports that someone else has claimed
 * it. The report only queues a review; nothing is revoked until an admin
 * confirms it, so a false report cannot knock out a legitimate claimant.
 */
export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return json({ error: identity.error }, identity.status);
  if (!identity.supabaseUserId) return json({ error: "A linked pass account is required" }, 403);
  if (!rateLimitOk(`ticket-report:${identity.supabaseUserId}`)) {
    return json({ error: "Too many reports. Please try again later." }, 429);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim().toLowerCase() : "";
  const issuer = typeof body?.issuer === "string" ? body.issuer.trim().toLowerCase() : "blockchain_summit_latam";
  let ticketCode = typeof body?.ticketCode === "string" ? body.ticketCode.trim().toUpperCase() : "";
  const qrPayload = typeof body?.qrPayload === "string" ? body.qrPayload.trim() : "";
  // Must mirror the claim API: a QR without a readable reference is identified
  // by a digest of its payload.
  if (!ticketCode && qrPayload) {
    ticketCode = createHash("sha256").update(qrPayload).digest("hex").slice(0, 24).toUpperCase();
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim().toLowerCase() : "impersonation";
  const details = typeof body?.details === "string" ? body.details.trim().slice(0, 1000) : null;
  if (!EVENT_ID_PATTERN.test(eventId)) return json({ error: "A valid event is required" }, 400);
  if (!ISSUER_PATTERN.test(issuer)) return json({ error: "A valid ticket issuer is required" }, 400);
  if (ticketCode.length < 4 || ticketCode.length > 128) return json({ error: "The original ticket code is required" }, 400);
  if (!REASONS.has(reason)) return json({ error: "Unsupported report reason" }, 400);

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase.rpc("report_external_ticket", {
    p_reporter_user_id: identity.supabaseUserId,
    p_event_id: eventId,
    p_issuer: issuer,
    p_ticket_code: ticketCode,
    p_reason: reason,
    p_details: details,
  });
  if (error) {
    if (/own ticket claim/i.test(error.message || "")) {
      return json({ error: "You cannot report your own ticket claim" }, 400);
    }
    console.error("[ticket-report] submit failed:", error);
    return json({ error: "Unable to submit the ticket report" }, 503);
  }
  return json({ data }, 201);
}
