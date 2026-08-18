# Changelog

All notable changes to `@hashpass/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
`@hashpass/sdk` and `@hashpass/sdk-cli` intentionally share one version
number (see `ARCHITECTURE.md`'s "Release contract") and are tagged together
as `sdk-cli-v<version>`, but each package keeps its own changelog describing
only what changed in that package.

## [Unreleased]

## [0.1.0] - 2026-08-18

### Added

- Initial release. Runtime-neutral HTTP transport with retries, timeouts,
  idempotency-key support, and typed `HashpassError` mapping.
- `auth`: device-code authentication (`beginDeviceLogin`/`waitForDeviceLogin`/
  `logout`), pluggable `AuthSessionStore`, and automatic access-token refresh.
- `authQr`: passwordless QR login ("Sign in with Hashpass") — PKCE challenge
  creation, poll, exchange, and the approving side's approve/deny.
- `qrLinks`: custom, trackable QR link management (create/list/get/
  slug-availability/update/delete/analytics).
- `support`: AI-assisted support tickets, messaging, human handoff, and a
  cursor-polling event stream (`watchTicket`).

Not yet published to npm as of this entry. Compare links will be added here
once the `sdk-cli-v0.1.0` tag exists.
