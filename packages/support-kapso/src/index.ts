import { createHmac, timingSafeEqual } from "node:crypto";

export const KAPSO_BASE_URL = "https://api.kapso.ai/meta/whatsapp";
export const DEFAULT_TICKET_TEMPLATE = "hashpass_support_ticket_v1";

export interface KapsoWebhookHeaders {
  "x-webhook-signature"?: string | string[] | undefined;
  "x-idempotency-key"?: string | string[] | undefined;
}

export interface NormalizedKapsoWebhook {
  idempotencyKey: string;
  signature: string;
  rawBody: Buffer;
  payload: unknown;
}

export function signKapsoWebhook(rawBody: Buffer | string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifyKapsoSignature(rawBody: Buffer | string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const normalized = signature.startsWith("sha256=") ? signature.slice("sha256=".length) : signature;
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  const expected = Buffer.from(signKapsoWebhook(rawBody, secret), "hex");
  const received = Buffer.from(normalized, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function normalizeKapsoWebhook(rawBody: Buffer | string, headers: KapsoWebhookHeaders, secret: string): NormalizedKapsoWebhook {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
  const signature = firstHeader(headers["x-webhook-signature"]);
  if (!verifyKapsoSignature(body, signature, secret)) throw new Error("Invalid Kapso webhook signature");
  const idempotencyKey = firstHeader(headers["x-idempotency-key"]);
  if (!idempotencyKey) throw new Error("Missing Kapso webhook idempotency key");
  return { idempotencyKey, signature: signature!, rawBody: body, payload: JSON.parse(body.toString("utf8")) };
}

export function redactKapsoPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(redactKapsoPayload);
  if (!payload || typeof payload !== "object") return payload;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/phone|wa_id|from|to|body|text|email|token|secret|key/i.test(key)) redacted[key] = "[redacted]";
    else redacted[key] = redactKapsoPayload(value);
  }
  return redacted;
}

export type WhatsAppWindowState = "open_window" | "closed_window_template_required";
export function routeForAdministratorWindow(lastInboundAt: Date | string | undefined, now: Date = new Date()): WhatsAppWindowState {
  if (!lastInboundAt) return "closed_window_template_required";
  const inbound = typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
  return now.getTime() - inbound.getTime() <= 24 * 60 * 60 * 1000 ? "open_window" : "closed_window_template_required";
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
