import { sendCriticalNotificationEmail } from "@/lib/email";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PASS_TYPES = new Set(["general", "business", "vip"]);
// Keep the reviewer fan-out server-side. The production registry contains
// Rodrigo Sainz's active BSL account at r@blockchainsummit.la and a legacy
// account at rodrigo@sainz.cl; both remain explicit recipients until the
// legacy account is retired.
const REVIEW_EMAILS: string[] = (process.env.PASS_UPGRADE_REVIEW_EMAILS || "edward@hashpass.app,r@blockchainsummit.la,rodrigo@sainz.cl")
  .split(",")
  .map((email: string) => email.trim().toLowerCase())
  .filter(Boolean);

const nextPassType = (passType: string, requestedPassType: string): boolean =>
  (passType === "general" && requestedPassType === "business") ||
  (passType === "business" && requestedPassType === "vip");

export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json({ error: identity.error }, { status: identity.status });
  }
  if (!identity.supabaseUserId) {
    return Response.json({ error: "Your account is still being connected. Please try again." }, { status: 409 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const passId = typeof body?.passId === "string" ? body.passId : "";
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
  const requestedPassType = typeof body?.requestedPassType === "string" ? body.requestedPassType : "";
  const ticketReference = typeof body?.ticketReference === "string"
    ? body.ticketReference.trim().slice(0, 120)
    : null;

  if (!UUID_RE.test(passId) || (eventId && eventId.length > 100) || !PASS_TYPES.has(requestedPassType)) {
    return Response.json({ error: "Invalid pass upgrade request" }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data: pass, error: passError } = await supabase
    .from("passes")
    .select("id,user_id,event_id,pass_type,status")
    .eq("id", passId)
    .eq("user_id", identity.supabaseUserId)
    .maybeSingle();
  if (passError) {
    console.error("[pass-upgrade] pass lookup failed:", passError.message);
    return Response.json({ error: "Unable to verify your pass" }, { status: 503 });
  }
  if (!pass || pass.status !== "active") {
    return Response.json({ error: "An active pass is required" }, { status: 403 });
  }
  if (eventId && pass.event_id !== eventId) {
    return Response.json({ error: "The pass does not belong to this event" }, { status: 409 });
  }
  if (!nextPassType(String(pass.pass_type), requestedPassType)) {
    return Response.json({ error: "Only the next pass tier can be requested" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("pass_upgrade_requests")
    .select("id,status,current_pass_type,requested_pass_type")
    .eq("pass_id", pass.id)
    .eq("user_id", identity.supabaseUserId)
    .eq("requested_pass_type", requestedPassType)
    .eq("status", "pending")
    .maybeSingle();
  if (existingError && existingError.code !== "42P01") {
    console.error("[pass-upgrade] request lookup failed:", existingError.message);
    return Response.json({ error: "Unable to check your existing request" }, { status: 503 });
  }
  if (existing) {
    return Response.json({
      data: {
        requestId: existing.id,
        status: "already_pending",
        currentPassType: existing.current_pass_type,
        requestedPassType: existing.requested_pass_type,
      },
    });
  }

  const { data: created, error: insertError } = await supabase
    .from("pass_upgrade_requests")
    .insert({
      user_id: identity.supabaseUserId,
      pass_id: pass.id,
      event_id: pass.event_id,
      current_pass_type: pass.pass_type,
      requested_pass_type: requestedPassType,
      ticket_reference: ticketReference || null,
    })
    .select("id,status,current_pass_type,requested_pass_type")
    .single();
  if (insertError || !created) {
    console.error("[pass-upgrade] request create failed:", insertError?.message);
    return Response.json({ error: "Unable to submit your upgrade request" }, { status: 503 });
  }

  await Promise.all(REVIEW_EMAILS.map(async (recipientEmail: string) => {
    const delivery = await sendCriticalNotificationEmail({
      recipientEmail,
      title: "Pass upgrade request requires review",
      message: `A verified account requested a ${requestedPassType.toUpperCase()} pass for ${pass.event_id}. Review the ticket reference in the admin queue.`,
      notificationType: "pass_upgrade_review_required",
      actionUrl: "https://hashpass.tech/dashboard/admin",
      actionLabel: "Open admin panel",
    });
    if (!delivery.success) console.warn("[pass-upgrade] reviewer email was not delivered");
  }));

  return Response.json({
    data: {
      requestId: created.id,
      status: "pending",
      currentPassType: created.current_pass_type,
      requestedPassType: created.requested_pass_type,
    },
  }, { status: 201 });
}
