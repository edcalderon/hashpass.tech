import { createHash, randomBytes } from "node:crypto";
import { sendCriticalNotificationEmail } from "@/lib/email";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const PASS_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/;
const APP_ORIGIN = (process.env.PUBLIC_APP_URL || "https://hashpass.tech").replace(/\/$/, "");

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "Vary": "Authorization" } });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const authenticatedUser = async (request: Request) => {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return { response: json({ error: identity.error }, identity.status) };
  if (!identity.supabaseUserId) return { response: json({ error: "Your account is still being connected. Please try again." }, 409) };
  if (!identity.email || !EMAIL_PATTERN.test(identity.email)) {
    return { response: json({ error: "A verified email is required to transfer a pass" }, 403) };
  }
  return { userId: identity.supabaseUserId, email: identity.email };
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "request";
  const supabase = getSupabaseServerForRequest(request);

  // Confirmation links are themselves a high-entropy email factor. Requiring
  // a pre-existing browser session would make a recipient's first click
  // impossible and would encourage insecure token copying into another app.
  if (action === "confirm") {
    const token = typeof body?.token === "string" ? body.token : "";
    if (!TOKEN_PATTERN.test(token)) return json({ error: "A valid transfer confirmation is required" }, 400);
    const hashed = hashToken(token);
    const { data: transfer, error: transferError } = await supabase
      .from("pass_transfer_requests")
      .select("id,status,expires_at,sender_token_hash,recipient_token_hash,sender_confirmed_at,recipient_confirmed_at")
      .or(`sender_token_hash.eq.${hashed},recipient_token_hash.eq.${hashed}`)
      .maybeSingle();
    if (transferError) return json({ error: "Unable to load this transfer" }, 503);
    if (!transfer || transfer.status !== "pending") {
      return json({ error: "This transfer is expired or already completed" }, 410);
    }
    if (new Date(transfer.expires_at).getTime() <= Date.now()) {
      const { error: expiryError } = await supabase
        .from("pass_transfer_requests")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", transfer.id)
        .eq("status", "pending");
      if (expiryError) return json({ error: "Unable to expire this transfer" }, 503);
      return json({ error: "This transfer is expired or already completed" }, 410);
    }
    const senderTokenMatch = transfer.sender_token_hash === hashed;
    const update = senderTokenMatch
      ? { sender_confirmed_at: new Date().toISOString() }
      : { recipient_confirmed_at: new Date().toISOString() };
    const { error: updateError } = await supabase
      .from("pass_transfer_requests")
      .update(update)
      .eq("id", transfer.id)
      .eq("status", "pending");
    if (updateError) return json({ error: "Unable to confirm this transfer" }, 503);

    const { data: currentTransfer, error: currentTransferError } = await supabase
      .from("pass_transfer_requests")
      .select("sender_confirmed_at,recipient_confirmed_at,status")
      .eq("id", transfer.id)
      .maybeSingle();
    if (currentTransferError) return json({ error: "Unable to verify this transfer confirmation" }, 503);
    const senderConfirmed = Boolean(currentTransfer?.sender_confirmed_at);
    const recipientConfirmed = Boolean(currentTransfer?.recipient_confirmed_at);
    let status: "confirmed" | "completed" = "confirmed";
    if (senderConfirmed && recipientConfirmed) {
      const { data: completed, error: completeError } = await supabase.rpc("complete_pass_transfer", { p_request_id: transfer.id });
      if (completeError) return json({ error: "Unable to complete this transfer" }, 503);
      if (!completed) return json({ error: "The pass changed before this transfer could complete" }, 409);
      status = "completed";
    }
    return json({ data: { requestId: transfer.id, status } });
  }

  const auth = await authenticatedUser(request);
  if ("response" in auth) return auth.response;

  if (action === "request") {
    const passId = typeof body?.passId === "string" ? body.passId.trim() : "";
    const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
    const recipientEmail = typeof body?.recipientEmail === "string" ? body.recipientEmail.trim().toLowerCase() : "";
    if (!PASS_ID_PATTERN.test(passId) || !eventId || !EMAIL_PATTERN.test(recipientEmail)) {
      return json({ error: "A valid pass, event, and recipient email are required" }, 400);
    }
    if (recipientEmail === auth.email.toLowerCase()) return json({ error: "A pass cannot be transferred to your own account" }, 400);

    const { data: pass, error: passError } = await supabase
      .from("passes")
      .select("id,event_id,status,pass_type")
      .eq("id", passId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (passError) return json({ error: "Unable to verify your pass" }, 503);
    if (!pass || pass.status !== "active") return json({ error: "An active pass is required" }, 403);
    if (pass.event_id !== eventId) return json({ error: "The pass does not belong to this event" }, 409);

    const now = new Date().toISOString();
    const { error: expirePendingError } = await supabase
      .from("pass_transfer_requests")
      .update({ status: "expired", updated_at: now })
      .eq("pass_id", String(pass.id))
      .eq("status", "pending")
      .lt("expires_at", now);
    if (expirePendingError) return json({ error: "Unable to expire an older transfer" }, 503);

    const { data: recipient, error: recipientError } = await supabase
      .from("user")
      .select("id,provider_ids")
      .eq("email", recipientEmail)
      .maybeSingle();
    if (recipientError) return json({ error: "Unable to find the recipient account" }, 503);
    const recipientUserId = recipient?.provider_ids?.supabase;
    if (!recipientUserId) return json({ error: "The recipient must create and verify a HASHPASS account first" }, 404);

    const senderToken = randomBytes(32).toString("base64url");
    const recipientToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: transfer, error: insertError } = await supabase
      .from("pass_transfer_requests")
      .insert({
        pass_id: String(pass.id),
        event_id: String(pass.event_id),
        sender_user_id: auth.userId,
        recipient_user_id: String(recipientUserId),
        recipient_email: recipientEmail,
        sender_token_hash: hashToken(senderToken),
        recipient_token_hash: hashToken(recipientToken),
        expires_at: expiresAt,
      })
      .select("id,expires_at")
      .single();
    if (insertError || !transfer) {
      if (insertError?.code === "23505") return json({ error: "This pass already has a pending transfer" }, 409);
      return json({ error: "Unable to start the ticket transfer" }, 503);
    }

    const senderUrl = `${APP_ORIGIN}/transfer/confirm?token=${encodeURIComponent(senderToken)}`;
    const recipientUrl = `${APP_ORIGIN}/transfer/confirm?token=${encodeURIComponent(recipientToken)}`;
    await Promise.all([
      sendCriticalNotificationEmail({
        recipientEmail: auth.email,
        title: "Confirm your HASHPASS ticket transfer",
        message: `You started a secure transfer for your ${pass.event_id} pass. Confirm it within 24 hours to continue.`,
        notificationType: "pass_transfer_sender_confirmation",
        actionUrl: senderUrl,
        actionLabel: "Confirm transfer",
      }),
      sendCriticalNotificationEmail({
        recipientEmail,
        title: "A HASHPASS ticket was sent to you",
        message: `Confirm this transfer within 24 hours to accept the ${pass.event_id} pass. Both confirmations are required.`,
        notificationType: "pass_transfer_recipient_confirmation",
        actionUrl: recipientUrl,
        actionLabel: "Accept ticket",
      }),
    ]);
    return json({ data: { requestId: transfer.id, status: "pending", expiresAt: transfer.expires_at } }, 201);
  }

  return json({ error: "Unsupported transfer action" }, 400);
}
