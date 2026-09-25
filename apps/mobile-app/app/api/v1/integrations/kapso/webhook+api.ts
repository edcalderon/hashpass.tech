import { normalizeKapsoWebhook } from "@hashpass/support-kapso";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

// Kapso webhook receiver. Reads the raw body BEFORE any JSON parsing --
// HMAC verification must run over the exact bytes Kapso signed, not a
// reserialized JSON.parse/stringify round-trip, which can change byte
// content (key order, number formatting, whitespace) and break the
// signature. See packages/support-kapso/src/index.ts for the verification
// primitives.
//
// No synchronous reply/send happens here: this repo has no background-job
// worker infrastructure yet (see docs/support/architecture.md), so inbound
// events are only durably persisted with `processed = false` for a later
// processing phase. The unique idempotency_key constraint is what makes
// Kapso's at-least-once redelivery safe to accept twice.
export async function POST(request: Request) {
  const secret = process.env.KAPSO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[integrations/kapso/webhook] KAPSO_WEBHOOK_SECRET is not configured");
    return Response.json({ message: "Webhook receiver is not configured" }, { status: 500 });
  }

  const rawBody = await request.text();

  let normalized;
  try {
    normalized = normalizeKapsoWebhook(
      rawBody,
      {
        "x-webhook-signature": request.headers.get("x-webhook-signature") ?? undefined,
        "x-idempotency-key": request.headers.get("x-idempotency-key") ?? undefined,
      },
      secret,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook";
    const status = message.toLowerCase().includes("idempotency") ? 400 : 401;
    console.warn("[integrations/kapso/webhook] rejected:", message);
    return Response.json({ message }, { status });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { error } = await supabase.from("support_kapso_inbound_events").insert({
    idempotency_key: normalized.idempotencyKey,
    payload: normalized.payload as object,
  });

  // 23505 = unique_violation on idempotency_key: Kapso redelivered an event
  // we already accepted. Treat as success, not an error.
  if (error && error.code !== "23505") {
    console.error("[integrations/kapso/webhook] persist failed:", error.message);
    return Response.json({ message: "Unable to persist webhook" }, { status: 500 });
  }

  return Response.json({ status: error?.code === "23505" ? "duplicate" : "accepted" }, { status: 200 });
}
