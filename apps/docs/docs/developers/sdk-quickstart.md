---
title: SDK quickstart
---

# SDK quickstart

Install the official client:

```bash
pnpm add @hashpass-tech/sdk
```

Create one client at the edge of your application. The client defaults to the production API; select `development` or `local` only for the matching environment.

```ts
import { createHashpass } from '@hashpass-tech/sdk';

const hashpass = createHashpass({
  appId: 'your-public-app-id',
  environment: 'production',
  sessionStore: {
    get: async () => null,
    set: async (session) => {
      // Persist with the platform's protected storage.
    },
    clear: async () => {
      // Remove the protected session.
    },
  },
});
```

`appId` is public and identifies your integration. It is not a secret and does not replace user authentication.

## First request: support

The support API obtains and stores a separate visitor credential. This avoids mixing a customer-support conversation token with the primary HASHPASS sign-in session.

```ts
await hashpass.support.ensureSession();

const ticket = await hashpass.support.createTicket({
  subject: 'Checkout needs help',
  message: 'The confirmation screen has been loading for two minutes.',
  context: { platform: 'web', appVersion: '1.0.0' },
  idempotencyKey: crypto.randomUUID(),
});
```

Use a stable idempotency key for a single user action. Do not reuse a key for a different ticket or mutation.

## Production storage

The default session store is in-memory. It is appropriate for tests and short-lived demos only. Inject a durable store protected by the host platform: Keychain/Keystore for native apps, and a carefully designed secure browser storage strategy for web apps. Do not place refresh tokens in plain `localStorage`.

## Errors and cancellation

The SDK throws `HashpassError`, which includes a typed code and may include an HTTP status and request ID. Pass `AbortSignal` into long-running requests or streams and stop the request when the owning UI disappears.

```ts
import { HashpassError } from '@hashpass-tech/sdk';

try {
  await hashpass.support.listTickets();
} catch (error) {
  if (error instanceof HashpassError) {
    console.error(error.code, error.status, error.requestId);
  }
}
```
