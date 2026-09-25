---
title: Developer SDK
slug: /developers/
---

# Build with HASHPASS

`@hashpass-tech/sdk` is the runtime-neutral client for HASHPASS. Use it in a browser, React Native app, server, or CLI adapter to integrate support, passwordless QR sign-in, and managed QR links without tying product code to a specific UI framework.

## Pick a path

- [SDK quickstart](sdk-quickstart.md) — install the client, choose an environment, and create a support ticket.
- [QR sign-in](qr-sign-in.md) — start and complete a PKCE-bound passwordless login challenge.
- [Support](support.md) — create, update, and watch customer tickets with a visitor-specific credential.
- [QR links](qr-links.md) — create, manage, and measure authenticated campaign links.

## What the SDK owns

- Typed requests and `HashpassError` failures.
- Bounded retry behaviour for safe requests.
- Idempotency keys for mutations.
- Isolated storage for a user session and a support-visitor session.
- Cursor polling that works in every supported runtime.

## What your app owns

- A public HASHPASS application ID.
- Secure session storage appropriate for the runtime.
- Rendering the product UI, including QR codes and ticket timelines.
- Cancellation with `AbortSignal` when a screen, request, or process ends.

Never place a client secret, refresh token, or support token in source control, analytics, or application logs.
