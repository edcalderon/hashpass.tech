---
title: QR links
---

# Managed QR links

`hashpass.qrLinks` manages authenticated, trackable short links for campaigns and events. It shares the Links service configuration with QR sign-in, but it always acts under the caller's own authenticated session.

## Create a link

```ts
const link = await hashpass.qrLinks.create({
  name: 'Medellín registration',
  destinationUrl: 'https://hashpass.tech/events/hash-poker/event-info',
  publicSlug: 'poker-medellin',
  captchaToken: solvedCaptchaToken,
  campaign: {
    source: 'venue-poster',
    medium: 'qr',
    campaign: 'hash-poker',
  },
});
```

The service remains authoritative for slug uniqueness. Use `slugAvailability()` to offer feedback before saving, then handle a collision response at creation time.

## Manage lifecycle and analytics

```ts
await hashpass.qrLinks.update(link.id, { status: 'paused' });

const analytics = await hashpass.qrLinks.analytics(link.id);
console.log(analytics.totalScans, analytics.scansByDevice);
```

Use `paused` for a temporary campaign stop and `archived` for a completed link. Deleting a link disables its public redirect; make that action explicit in product UI.
