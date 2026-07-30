# `@hashpass/sdk`

The official, runtime-neutral Hashpass client. Its first stable domain is cross-app support: AI-assisted conversations, human handoff, and ticket lifecycle management. The authentication surface is intentionally provider- and storage-driven so the same client can later power global Hashpass sign-in.

## Install

```sh
npm install @hashpass/sdk
```

## Support from web or React Native

```ts
import { createHashpass } from "@hashpass/sdk";

const hashpass = createHashpass({
  appId: "your-public-app-id",
  // For native apps, implement this with Keychain/Keystore-backed storage.
  sessionStore,
});

const ticket = await hashpass.support.createTicket({
  subject: "Checkout is not completing",
  message: "The confirmation screen has been loading for two minutes.",
  context: { platform: "ios", appVersion: "3.4.0" },
});

for await (const event of hashpass.support.watchTicket(ticket.id, { signal })) {
  renderSupportEvent(event);
}

await hashpass.support.requestHuman(ticket.id);
```

The package uses only standard Fetch, URL, AbortSignal, and Web Platform types. Supply a `fetch` implementation on runtimes that do not provide one. It does not import React, Node, or native modules and can therefore be used by web, native, backend, and CLI adapters.

## Authentication boundary

`AuthSessionStore` is the security boundary. The default in-memory store is useful for short-lived browser sessions and tests, but applications should inject durable secure storage. Do not store refresh tokens in plain `localStorage`, AsyncStorage, source code, or application logs.

The device authorization flow used by headless clients is available through `hashpass.auth.beginDeviceLogin()` and `waitForDeviceLogin()`. Browser and native redirect/passkey adapters can implement `AuthProvider` without changing the support client.

## API guarantees

- Public APIs are exported only from `@hashpass/sdk`, `@hashpass/sdk/auth`, and `@hashpass/sdk/support`.
- Mutations accept idempotency keys; safe requests retry transient failures with bounded exponential backoff.
- API failures use a typed `HashpassError` and may include HTTP status, request ID, and structured details.
- Live support uses cursor-based polling for universal runtime support and can later be upgraded internally to SSE/WebSocket without changing event types.
