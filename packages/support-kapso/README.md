# @hashpass/support-kapso

Server-only Kapso WhatsApp adapter primitives for HashPass Support.

This package must not be imported by browser, React, or React Native bundles. It contains raw-body webhook verification helpers, payload redaction, idempotency extraction, and 24-hour customer-service-window routing primitives. Customer-facing SDKs intentionally do not expose Kapso concepts.

Kapso documentation verified on 2026-08-05: Kapso signs webhooks with HMAC-SHA256 in `X-Webhook-Signature`, forwards an `X-Idempotency-Key`, and supports the documented base URL `https://api.kapso.ai/meta/whatsapp`.
