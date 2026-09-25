---
title: Support API
---

# Support API

The SDK support client creates AI-assisted conversations, accepts agent handoff, and exposes a portable event stream. It uses cursor polling so the same interface works in browser, native, server, and CLI contexts.

## Create a ticket

```ts
const ticket = await hashpass.support.createTicket({
  subject: 'Registration issue',
  message: 'My invitation link opens a blank screen.',
  priority: 'normal',
  identity: { email: 'person@example.com', locale: 'en' },
  context: { platform: 'ios', appVersion: '3.4.0' },
  idempotencyKey: crypto.randomUUID(),
});
```

Identity fields are optional. Send only the data necessary to help the visitor; do not add secrets or sensitive free-form data to `context`.

## Watch a conversation

```ts
for await (const event of hashpass.support.watchTicket(ticket.id, {
  signal: abortController.signal,
})) {
  if (event.type === 'message.created') {
    renderMessage(event.message);
  }
}
```

Persist the latest event cursor with the ticket if the UI needs to resume efficiently. Do not replay historical events as unread notifications when restoring an existing conversation.

## Handoff and lifecycle

```ts
await hashpass.support.requestHuman(ticket.id);
await hashpass.support.sendMessage(ticket.id, {
  body: 'I can share a screen recording if useful.',
  idempotencyKey: crypto.randomUUID(),
});
await hashpass.support.markTicketRead(ticket.id);
```

Use a fresh idempotency key for each distinct message. The SDK scopes visitor sessions separately from primary authentication so an integration cannot accidentally send a support credential to unrelated APIs.
