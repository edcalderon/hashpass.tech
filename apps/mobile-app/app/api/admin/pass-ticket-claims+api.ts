import { authorizeGlobalAdmin } from "@/lib/server/global-admin";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { createHash } from "node:crypto";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });

export async function GET(request: Request) {
  const admin = await authorizeGlobalAdmin(request);
  if ("response" in admin) return admin.response;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const eventId = url.searchParams.get("eventId");
  let query = admin.supabase
    .from("external_ticket_claims")
    .select("id,event_id,issuer,claimant_user_id,ticket_code_last4,source_qr_payload,source_ticket_metadata,requested_pass_type,status,reviewer_note,hashpass_pass_id,submitted_at,reviewed_at,converted_at")
    .order("submitted_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query;
  if (error) return json({ error: "Unable to load ticket claims" }, 503);
  const claims = data || [];
  // Reviewers need to know who is asking for the pass. Resolve each distinct
  // claimant once; a failed lookup leaves the email empty instead of hiding
  // the claim from the review queue.
  const claimantIds = [...new Set(claims.map((claim: { claimant_user_id: string }) => claim.claimant_user_id))];
  const emails = new Map<string, string | null>();
  await Promise.all(claimantIds.map(async (id) => {
    try {
      const { data: lookup } = await admin.supabase.auth.admin.getUserById(id as string);
      emails.set(id as string, lookup?.user?.email ?? null);
    } catch {
      emails.set(id as string, null);
    }
  }));
  return json({
    data: claims.map((claim: { claimant_user_id: string }) => ({
      ...claim,
      claimant_email: emails.get(claim.claimant_user_id) ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const admin = await authorizeGlobalAdmin(request);
  if ("response" in admin) return admin.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const claimId = typeof body?.claimId === "string" ? body.claimId.trim() : "";
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  const passType = typeof body?.passType === "string" ? body.passType.trim().toLowerCase() : null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : null;
  if (action === "approve" && passType && !["general", "business", "vip"].includes(passType)) {
    return json({ error: "Invalid pass type" }, 400);
  }
  const supabase = getSupabaseServerForRequest(request);
  if (action === "inspect") {
    const qrPayload = typeof body?.qrPayload === "string" ? body.qrPayload.trim() : "";
    if (!qrPayload) return json({ error: "A scanned QR payload is required" }, 400);
    const sourceQrDigest = createHash("sha256").update(qrPayload).digest("hex");
    const { data: claim, error: inspectError } = await supabase
      .from("external_ticket_claims")
      .select("id,event_id,issuer,claimant_user_id,ticket_code_last4,source_ticket_metadata,requested_pass_type,status,reviewer_note,hashpass_pass_id,submitted_at,reviewed_at,converted_at")
      .eq("source_qr_digest", sourceQrDigest)
      .maybeSingle();
    if (inspectError) return json({ error: "Unable to inspect the original ticket QR" }, 503);
    if (!claim) {
      return json({ data: { valid: false, status: "unregistered", message: "This original ticket QR has not been submitted" } });
    }
    const reusable = claim.status === "pending" || claim.status === "validated";
    // Staff need to see who holds the ticket to spot impersonation.
    let claimantEmail: string | null = null;
    try {
      const { data: lookup } = await admin.supabase.auth.admin.getUserById(claim.claimant_user_id);
      claimantEmail = lookup?.user?.email ?? null;
    } catch {
      claimantEmail = null;
    }
    return json({ data: {
      valid: reusable,
      status: claim.status,
      message: reusable
        ? "Original ticket claim found and ready for review"
        : claim.status === "converted"
          ? "This original ticket has already been converted"
          : "This original ticket claim was rejected",
      claim: { ...claim, claimant_email: claimantEmail },
    } });
  }
  if (!claimId || !["approve", "reject"].includes(action)) return json({ error: "A claim and review action are required" }, 400);
  const { data, error } = await supabase.rpc("review_external_ticket_claim", {
    p_claim_id: claimId,
    p_actor_user_id: admin.userId,
    p_action: action,
    p_pass_type: passType,
    p_note: note,
  });
  if (error) {
    console.error("[ticket-claim] review failed:", error);
    return json({ error: "Unable to review the ticket claim" }, 503);
  }
  return json({ data });
}
