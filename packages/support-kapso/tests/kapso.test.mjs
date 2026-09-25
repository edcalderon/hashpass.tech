import assert from "node:assert/strict";
import test from "node:test";
import { normalizeKapsoWebhook, redactKapsoPayload, routeForAdministratorWindow, signKapsoWebhook, verifyKapsoSignature } from "../dist/index.js";

test("verifies Kapso HMAC signatures using raw body", () => {
  const body = Buffer.from(JSON.stringify({ entry: [{ id: "evt_1" }] }));
  const signature = signKapsoWebhook(body, "secret");
  assert.equal(verifyKapsoSignature(body, signature, "secret"), true);
  assert.equal(verifyKapsoSignature(Buffer.from("{}"), signature, "secret"), false);
});

test("normalizes webhook and requires idempotency key", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const signature = signKapsoWebhook(body, "secret");
  const normalized = normalizeKapsoWebhook(body, { "x-webhook-signature": `sha256=${signature}`, "x-idempotency-key": "idem_1" }, "secret");
  assert.equal(normalized.idempotencyKey, "idem_1");
  assert.deepEqual(normalized.payload, { object: "whatsapp_business_account" });
});

test("redacts sensitive webhook fields before persistence/logging", () => {
  assert.deepEqual(redactKapsoPayload({ from: "15551234567", text: { body: "hello" }, safe: "ok" }), { from: "[redacted]", text: "[redacted]", safe: "ok" });
});

test("routes closed WhatsApp windows to approved-template fallback", () => {
  const now = new Date("2026-08-05T12:00:00Z");
  assert.equal(routeForAdministratorWindow("2026-08-05T00:00:00Z", now), "open_window");
  assert.equal(routeForAdministratorWindow("2026-08-03T00:00:00Z", now), "closed_window_template_required");
});
