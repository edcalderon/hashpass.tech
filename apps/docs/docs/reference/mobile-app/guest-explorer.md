---
title: Guest Explorer and registration
---

# Guest Explorer and registration

The public Explorer lets visitors discover events without creating an account.
It uses the same event list, search, filters and layouts as the signed-in app.
Guest mode is a simplified experience; account features require registration or
sign-in.

## Browse without an account

Open `/dashboard/explore`. Event links can include an `eventId`, for example
`/dashboard/explore?eventId=hash-poker`. Existing `/events` links redirect to the
Explorer and preserve the event identifier.

Visitors can search the real event catalogue, filter results, change the list
layout and browse organizer images or videos in the showcase. Upcoming events
are prioritized. Media playback follows the animation preference and pauses when
the showcase is inactive.

The desktop **Guest mode** label explains the simplified experience. Its tooltip
opens on hover, keyboard focus or press. Escape, loss of focus or moving the
pointer away dismisses it. Register and use the app to access account features;
the existing install control exposes available installation options.

## Change appearance and language

The settings control before **Join HASHPASS** opens the existing application
preferences. Visitors can change light, dark or automatic appearance, language,
and animation level without signing in. Preferences persist through the same
settings providers used by the signed-in app. On narrow screens, settings open
in a centered panel.

## Register or sign in

Select **Join HASHPASS**, or try an account feature such as saving an event,
entering a room, managing passes or opening the wallet. A registration dialog
opens over the Explorer instead of navigating to a separate sign-in screen.

The dialog offers:

- **Email verification code:** request a code and enter it in the dialog. The
  existing SMS alternative remains available where supported.
- **Google:** use the application's existing Google sign-in integration. On web,
  Google authorization leaves the current page and returns through the auth
  callback to the Explorer path and selected event query. Native uses the
  existing native authentication flow.

The Google button shows progress and prevents duplicate requests while sign-in
is pending. Provider errors use the existing authentication error feedback.
Closing the dialog leaves the current event search in place. A full browser
OAuth redirect retains the selected event URL; in-memory search and filter state
is not guaranteed to survive that reload.

Other private dashboard routes remain protected. Guest mode does not create a
simulated account or grant access to private user data.

## Related release changes and limits

The shared design system defines colors, radii, controls and motion in
`packages/ui/src/system`. The implementation contract is documented in the root
`DESIGN.md` and `docs/design-system-storybook.md`. Landing content and guest
explanations are available in English, Spanish, Korean, French, Portuguese and
German; some legacy Explorer labels still fall back to English.

Wallet enrollment and encrypted backup/recovery onboarding are in development.
Production wallet creation remains disabled and migration V097 has not been
applied to production as part of this work. Transaction signing, external
MetaMask recovery verification and Ledger integration remain pending. Do not
interpret the wallet UI as production signing support.

The project runtime baseline is Node 24.21.0. Use the root `.nvmrc` and pinned
package manager; operational details are in `packages/tools/NODE_RUNTIME.md`.

## Validation

The modal's OTP and Google dispatch behavior is covered by component tests,
including duplicate-request protection. The public modal and Google button were
inspected in the local browser. Real Google account authorization and physical
native-device callback testing remain separate checks before claiming those
flows have been verified end to end.

### Enrollment identity and interrupted setup

Enrollment ownership uses the canonical `public.user.id` returned by the
 authenticated enrollment API. It must not be compared to Supabase
`auth.users.id` (`dbUserId`) or a Better Auth provider ID. The screen isolates
requests by the current account and discards responses after an account change;
a pending Supabase bridge does not prevent loading enrollment metadata.

Before reserving a wallet, the device durably stores a scoped operation ID in its
wallet store. If the server commits but the response is lost, the same device can
retry that operation after reopening setup. A different device without the
original intent cannot resume key generation. The intent is consumed atomically
before key creation; if creation may already have started and no vault is found,
setup fails closed instead of generating replacement keys. Existing durable
vaults continue through the registration retry path.
