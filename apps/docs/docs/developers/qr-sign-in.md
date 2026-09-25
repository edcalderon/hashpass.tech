---
title: QR sign-in
---

# Passwordless QR sign-in

HashPass Auth lets a browser or another untrusted screen start a login, then lets a user approve it from an already signed-in HASHPASS app. The flow is PKCE-bound and the secret binding value stays with the initiating client.

## Configure the links service

QR sign-in uses the HASHPASS Links service independently from the main API. Supply `linksApiBaseUrl` explicitly for the environment you operate; do not assume a default.

```ts
const hashpass = createHashpass({
  appId: 'your-public-app-id',
  linksApiBaseUrl: 'https://your-links-service.example/',
});
```

## Start and wait for approval

```ts
const login = await hashpass.authQr.beginLogin();

// Render only login.challenge.qrUrl as the QR payload.
renderQrCode(login.challenge.qrUrl);

const session = await hashpass.authQr.waitForLogin(login, {
  signal: abortController.signal,
  onPoll: ({ status }) => updateLoginStatus(status),
});

await installSession(session);
```

Keep `codeVerifier` and `binding`, returned within `login`, in memory only. They prove that the client which created the challenge is the one exchanging an approved one-time code. Do not render, log, or send either value to analytics.

## Approve from a signed-in device

The approving client needs its own bearer token. It is distinct from the anonymous browser client that created the challenge.

```ts
const approver = createHashpass({
  appId: 'your-public-app-id',
  linksApiBaseUrl: 'https://your-links-service.example/',
  auth: { getAccessToken: () => currentUserAccessToken },
});

await approver.authQr.respondToLogin(challengeId, 'approve');
```

Handle denial, expiration, and cancellation as normal user-facing states. Never silently retry an expired challenge; create a new QR code instead.
