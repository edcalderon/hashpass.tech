# Platform wallet compatibility: Samsung, Google, and Apple

**Status:** Feasibility assessment

**Reviewed:** 2026-10-03

**Scope:** HASHPASS Core event passes, check-in credentials, account authentication,
and the separate non-custodial crypto wallet

## Recommendation

Build one **HASHPASS pass issuance service** with adapters for Apple Wallet,
Google Wallet, and Samsung Wallet. Keep the HASHPASS `passes` row as the source
of truth, keep redemption in the existing HASHPASS verifier, and treat each
platform wallet as a presentation and delivery channel rather than a new system
of record.

“Samsung Pass” should not be used as the name of the ticket integration:

- **Samsung Wallet Cards** is the relevant Samsung integration for event tickets,
  QR codes, updates, and lifecycle callbacks.
- **Samsung Pass** is relevant to authentication. HASHPASS can support it through
  standards-based passkeys/WebAuthn, alongside the platform credential providers
  on Android, iOS, and the web. It is not a ticket-pass API.

This produces two deliberately separate workstreams:

1. **Wallet passes:** export a HASHPASS event credential to Apple Wallet, Google
   Wallet, or Samsung Wallet.
2. **Passkeys:** add passwordless sign-in and, after a separate security design,
   possibly use a passkey as fresh step-up evidence for local crypto signing.

Do not merge either concept with the non-custodial ETH/BTC/SOL wallet. Platform
passes contain public presentation data and a redeemable credential; they must
never contain seed phrases, private keys, wallet passwords, recovery exports, or
crypto signing material.

## Why this fits the current core

HASHPASS already has most of the domain foundation:

- `passes` are event-scoped and carry a stable pass ID, type, status, pass number,
  access features, perks, and usage limits.
- `/api/passes` resolves the authenticated owner on the server, returns the best
  pass per event, and prevents clients from self-issuing paid tiers.
- The QR subsystem creates server-side tokens with expiry, status, usage count,
  and maximum uses, and redemption is atomic through `validate_and_use_qr`.
- The app already renders a multi-event pass wallet and separates event passes
  from crypto assets.

The missing layer is a durable mapping between the HASHPASS pass and the external
wallet object, plus issuer-specific rendering, signing, updates, and callbacks.

## Capability map

| HASHPASS need | Samsung | Google | Apple | Core decision |
| --- | --- | --- | --- | --- |
| Event ticket/pass | Samsung Wallet ticket card | `EventTicketClass` + `EventTicketObject` | PassKit `eventTicket` pass | Supported by all three |
| Add from app/web/email | Add to Samsung Wallet link/button | Signed JWT link/button or Android SDK | `.pkpass` from web/email or native PassKit UI | Generate links/files server-side |
| QR presentation | Static and portal-enabled Dynamic QR | Static or TOTP rotating barcode | QR/barcode in signed pass; updates require PassKit web service | Start with an opaque online-verification token; do not expose database IDs |
| Pass changes/revocation | Server API and card-state callbacks | Object patch/update and state | Re-sign pass, notify devices through PassKit update service | Outbox-driven adapter updates |
| NFC redemption | Optional program capability | Smart Tap with certified terminal requirements | NFC is entitlement/certificate/program constrained | Not MVP; keep QR scanners |
| Passwordless sign-in | Samsung Pass can store/use passkeys | Android/Google credential provider can store/use passkeys | iCloud Keychain can store/use passkeys | One WebAuthn RP, no vendor-specific account model |
| Non-custodial signing | Not a custody backend | Not a custody backend | Not a custody backend | Keep keys in HASHPASS local vault only |

Official references:

- [Samsung Add to Wallet overview](https://developer.samsung.com/wallet/addtosamsungwallet/overview.html)
  and [Samsung Wallet ticket schema](https://developer.samsung.com/wallet/api_new/walletcards/ticket.html)
- [Samsung Pass product capabilities](https://www.samsung.com/us/apps/samsung-pass/)
- [Google Wallet event tickets](https://developers.google.com/wallet/tickets/events),
  [class/object model](https://developers.google.com/wallet/generic/overview/how-classes-objects-work),
  and [rotating barcodes](https://developers.google.com/wallet/tickets/events/resources/rotating-barcodes)
- [Apple Wallet passes](https://developer.apple.com/documentation/WalletPasses),
  [building signed passes](https://developer.apple.com/documentation/walletpasses/building-a-pass),
  and [pass update web service](https://developer.apple.com/documentation/WalletPasses/adding-a-web-service-to-update-passes)

## Proposed core model

Add provider-neutral records rather than provider columns on `passes`:

### `external_wallet_passes`

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID |
| `pass_id` | FK to the canonical HASHPASS pass |
| `provider` | `apple`, `google`, or `samsung` |
| `provider_object_id` | Apple serial number, Google object ID, or Samsung `refId` |
| `provider_class_id` | Optional event template/class/card ID |
| `status` | `pending`, `active`, `suspended`, `expired`, `revoked`, `error` |
| `revision` | Monotonic content revision for idempotent updates |
| `last_synced_at` | Operational reconciliation timestamp |
| `last_error_code` | Non-secret, bounded support signal |
| timestamps | Audit lifecycle |

Use unique constraints on `(provider, provider_object_id)` and
`(pass_id, provider)`. Do not store provider private keys, certificates, access
tokens, or Apple device push tokens in this table. Store secrets in the existing
environment secret facility; encrypt Apple device registrations separately and
retain only what the PassKit protocol requires.

### `wallet_pass_outbox`

Record canonical lifecycle events such as `issued`, `changed`, `suspended`,
`revoked`, and `expired`. A retryable worker fans them out to provider adapters.
Use an idempotency key of `provider:pass_id:revision:event`. The transactional
outbox prevents a pass status change from succeeding while its external update is
silently lost.

### Stable presentation credential

Define a compact, versioned payload shared by all barcode adapters:

```text
https://hashpass.tech/p/<opaque-redemption-token>
```

The token must be random, scoped to one pass and environment, revocable, and
looked up only by a server endpoint that performs the same status/use checks as
the native HASHPASS scanner. It must not reveal `user_id`, `pass_id`, pass number,
email, tier, or entitlement data.

The current QR implementation creates database-backed, expiring, single-use
tokens. That is suitable for the in-app dynamic display, but not unchanged for a
platform pass that may remain offline or unopened for days. Introduce an explicit
redemption policy instead of continually embedding freshly generated database
tokens:

- **MVP:** stable opaque token, online scanner validation, immediate revocation,
  configurable use count, and short scanner replay lock.
- **Google hardening:** provider-native TOTP rotating barcode with one secret per
  pass, provisioned server-side without putting the secret in the Add-to-Wallet
  JWT.
- **Samsung hardening:** dynamic QR only after partner approval, device testing,
  and verification that its refresh contract matches HASHPASS validation.
- **Apple hardening:** use PassKit updates for changed/revoked credentials. Do not
  promise 30-second rotation unless an Apple-supported design is proven on real
  devices; a frequently pushed `.pkpass` is not equivalent to a local TOTP code.

The scanner must accept a versioned envelope so native dynamic QR and exported
wallet passes can coexist during rollout.

## Provider adapters

### Google Wallet

Use an event class per event/tenant/branding revision and an event-ticket object
per HASHPASS pass. Create objects server-side with the Wallet Objects REST API,
then produce a short-lived signed “Add to Google Wallet” JWT that references the
existing object ID. This avoids placing rotating-barcode secrets in a client-visible
JWT. Map canonical status changes to object state/patch operations.

Prerequisites include a Google Wallet issuer account, production publishing
approval, a dedicated cloud service account, approved branding, and separate test
and production issuer configuration. Google Wallet issuer credentials are not the
same as the app's Google OAuth credentials.

### Apple Wallet

Generate an `eventTicket` `.pkpass` on the server. Each bundle must have a stable
`passTypeIdentifier` and `serialNumber`, a manifest, Apple-issued Pass Type ID
certificate signature, localized assets/strings, and the HASHPASS barcode. Serve
it using the Wallet pass MIME type and support web/email distribution; the native
iOS app can later use the system add-pass controller.

Implement the PassKit web-service endpoints for device registration,
unregistration, changed-serial lookup, and latest-pass download. Use APNs only to
tell Wallet that an update exists; Wallet then fetches the newly signed pass.
Certificate rotation and expiry alerts are release gates.

### Samsung Wallet

Use Samsung Wallet Cards, not a Samsung Pass SDK. Apply in the Wallet Partners
Portal, obtain Partner ID/Card ID/certificates, configure a ticket-card template,
and implement Add to Samsung Wallet through the supported Data Transmit or Data
Fetch flow. Prefer Data Fetch if partner approval and latency permit it, because
the backend remains authoritative and less pass content travels in the link.

Handle Samsung's card-state callback and server update API idempotently. Treat
callback data as provider state, not proof that a ticket was redeemed. Redemption
continues through the HASHPASS barcode verifier.

### Passkeys and Samsung Pass

Implement passkeys as WebAuthn credentials owned by a HASHPASS account:

- server-generated, single-use challenges;
- exact RP ID and origin allowlists per environment;
- user verification required;
- sign counter handling that does not lock out legitimate multi-device synced
  credentials;
- multiple credentials per account, with names and revocation;
- recovery that does not fall back to a weaker, easily phished path;
- no reliance on attestation to identify “Samsung Pass.”

On compatible Galaxy devices, the system credential provider may offer Samsung
Pass. HASHPASS should not detect, require, or special-case it. The same WebAuthn
flow remains compatible with Google Password Manager, iCloud Keychain, security
keys, and other conforming providers.

Passkey login and wallet-signing authorization are distinct. A successful login
must not automatically unlock the local crypto vault. Any passkey-backed vault
unwrap or transaction authorization needs a separately reviewed protocol binding
the assertion to the wallet, session, transaction intent, expiry, and anti-replay
nonce.

## API outline

```text
POST /api/passes/:passId/wallet-links/:provider
GET  /api/passes/:passId/wallet-status

GET  /api/wallet/apple/passes/:passTypeId/:serialNumber
POST /api/wallet/apple/devices/:deviceId/registrations/:passTypeId/:serialNumber
DELETE /api/wallet/apple/devices/:deviceId/registrations/:passTypeId/:serialNumber
GET  /api/wallet/apple/devices/:deviceId/registrations/:passTypeId
POST /api/wallet/apple/log

POST /api/wallet/samsung/card-state
POST /api/wallet/redeem/:token
```

The add-link endpoint must derive the owner from the authenticated request, verify
that the pass belongs to that owner and is exportable, rate-limit issuance, and
return only a provider link or `.pkpass` download URL. It must never accept a
client-supplied owner ID, tier, status, class ID, barcode value, or callback URL.

## Delivery plan

### Phase 0 — partner and product gates

1. Confirm supported launch countries and tenant ownership of pass branding.
2. Open Google Wallet issuer, Apple Pass Type ID/certificate, and Samsung Wallet
   partner applications. These approvals can dominate lead time.
3. Decide whether a pass is an event ticket or a generic/membership credential.
4. Document privacy/retention for wallet-provider IDs and device registrations.
5. Obtain physical Galaxy, Pixel/Android, and iPhone test devices.

### Phase 1 — shared core and Google pilot

1. Add the external mapping, outbox, normalized pass view, and provider interface.
2. Add the stable opaque redemption envelope and backward-compatible scanner.
3. Implement Google event tickets first: it is the closest match to the current
   JSON/REST backend and offers a documented rotating-barcode upgrade path.
4. Add owner/authentication, idempotency, revocation, replay, and cross-environment
   negative tests.

### Phase 2 — Apple

1. Add deterministic `.pkpass` generation and signing tests with golden fixtures.
2. Add registration/update endpoints, APNs integration, certificate monitoring,
   and localization.
3. Test add, update, reinstall, revoke, offline display, expired certificate, and
   device restoration on real iPhones.

### Phase 3 — Samsung

1. Complete partner approval and ticket template review.
2. Add Samsung JWT/fetch, update, and callback adapters.
3. Test static QR first; gate Dynamic QR behind compatibility and replay testing on
   supported Galaxy/One UI versions and launch countries.

### Phase 4 — passkey authentication

Ship as an independent authentication project after recovery, account linking,
session elevation, and abuse cases are threat-modeled. Test provider-neutral
WebAuthn behavior, including Samsung Pass, without making Samsung-only claims.

## Acceptance criteria

- The same active HASHPASS pass can be added to each approved provider without
  creating a second entitlement or changing ownership.
- Revoking, suspending, expiring, or changing the canonical pass converges on all
  provider copies through idempotent retries and reconciliation.
- Every displayed barcode resolves to the correct environment and canonical pass;
  screenshots/replays follow the configured redemption policy.
- A provider callback cannot redeem, upgrade, transfer, or reactivate a pass.
- Cross-user and cross-tenant issuance attempts fail without disclosing whether a
  pass exists.
- No provider secret, passkey private key, Apple authentication token, user PII,
  or crypto-wallet secret appears in logs, analytics, URLs, or client bundles.
- Platform-wallet outages do not block the HASHPASS in-app pass or verifier.
- Accessibility, localization, dark/light assets, expired/cancelled states, and
  real-device behavior are verified for every supported provider.

## Risks and explicit non-goals

- Partner approval and regional availability are external dependencies; do not
  advertise a provider before production approval.
- NFC is not a QR replacement without compatible readers, certifications, and
  provider approval. It is out of the first release.
- A wallet pass is not a decentralized/verifiable credential by itself. If
  OpenProof claims are later exported, bind them behind a privacy-preserving link
  rather than putting attendee identity or claims directly in the barcode.
- Apple, Google, and Samsung layouts are provider-controlled. Pixel-perfect parity
  with the HASHPASS card UI is neither possible nor required.
- A platform pass does not replace the HASHPASS app for networking, meeting limits,
  boosts, token balances, recovery, or signing.
