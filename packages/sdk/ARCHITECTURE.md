# Hashpass SDK architecture

## Goals

1. Give every Hashpass-hosted app one support contract across browser, React Native, server, and command line environments.
2. Let AI answer first while preserving an explicit, auditable human handoff and ordinary ticket semantics.
3. Establish authentication seams now without coupling consumers to the current app authentication implementation.
4. Keep secrets in host-owned secure storage and keep the base SDK runtime-neutral.

## Package boundaries

| Package | Responsibility | Runtime dependencies |
| --- | --- | --- |
| `@hashpass/sdk` | HTTP policy, typed errors, auth contracts/device flow, support tickets and event stream | Web Platform APIs only |
| `@hashpass/sdk-cli` | Terminal UX and permission-restricted session persistence | Node 20+ and `@hashpass/sdk` |
| Future `@hashpass/sdk-react` | Hooks, provider, and a support messenger UI | React and `@hashpass/sdk` |
| Future native adapters | Keychain/Keystore session store, deep links, push notifications | Platform SDK and `@hashpass/sdk` |

The SDK models capabilities rather than vendors. The backend may route conversations through an AI model, an internal agent console, or Zendesk without exposing that choice to applications.

## Security model

- `appId` is public tenant/application routing metadata, never a secret.
- Access and refresh tokens enter the SDK only through `AuthProvider`/`AuthSessionStore`.
- The core package does not persist sessions. Native hosts must use Keychain/Keystore; browser hosts should prefer secure server cookies or ephemeral memory.
- CLI device login means the terminal never receives a user password. Its fallback file store uses atomic writes and mode `0600`.
- Idempotency keys make support mutations safe to reconcile across unreliable mobile networks.
- Request IDs and typed errors permit diagnostics without logging tokens or ticket bodies.

## Backend contract required for rollout

The client currently reserves these versioned endpoints:

- `POST /v1/auth/device/authorize`, `POST /v1/auth/device/token`, `POST /v1/auth/token`, `POST /v1/auth/revoke`
- `GET|POST /v1/support/tickets`, `GET|PATCH /v1/support/tickets/:id`
- `POST /v1/support/tickets/:id/messages`, `POST /v1/support/tickets/:id/handoff`
- `GET /v1/support/tickets/:id/events?cursor=...`

Before production enablement, publish an OpenAPI document, generate contract fixtures, define retention/redaction policy, rate limits, tenant isolation tests, event ordering guarantees, attachment upload constraints, and webhook signature verification. Cursor polling is the compatibility baseline; SSE, WebSocket, and push delivery can be negotiated later without altering `SupportEvent`.

## Release contract

Both packages intentionally share one version. Run `pnpm sdk:version <semver>`, review and commit the two manifest changes, then create a signed `sdk-cli-v<semver>` tag. The release workflow verifies tag/package parity, installs from the lockfile, typechecks, tests, inspects tarballs, publishes the core package before the CLI with npm provenance, and finally creates the GitHub release. A manual workflow dispatch is dry-run-only by default and cannot accidentally publish an untagged commit.

The npm environment should use npm trusted publishing with this exact GitHub workflow. If the organization temporarily uses an npm automation token, configure it only as an environment secret and never in repository files or logs.
