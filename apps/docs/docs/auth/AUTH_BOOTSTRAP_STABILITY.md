# Auth bootstrap stability

> **Critical runtime invariant.** Changes to authentication bootstrap, auth
> providers, or dashboard layout can freeze the signed-in application when
> this contract is broken. Treat this as a release-blocking regression area.

## What failed

The dashboard previously hit React's `Maximum update depth exceeded` error
immediately after authentication. The visible symptom was a frozen dashboard.

The cause was a feedback loop:

1. More than one mounted component subscribed through `useAuth()`.
2. Better Auth resolved the same provider/session state again.
3. The shared auth actor notified every subscriber, even though its logical
   auth state was unchanged.
4. A subscriber stored a newly created but equivalent view-state object,
   triggering a React render.
5. The dashboard's nested header remounted a hidden QR scanner, which added
   another `useAuth()` subscriber and repeated the cycle.

The affected paths were `useAuth.ts`, `auth-session-machine.ts`, and the
dashboard header layout. A 401 from a legacy Directus fallback probe may be
visible when no Directus session exists, but it is not the cause of this
render loop and must not be allowed to block authenticated UI.

## Invariants

### Provider resolution is idempotent

`PROVIDER_RESOLVED` is allowed to change the auth-session-machine context only
when the meaningful provider state changed: readiness, login status, selected
user identity, or session tokens/expiry. Resolving an identical Better Auth
session twice must retain the same context object.

### React state changes only for a logical auth change

`useAuth()` subscribers may receive duplicate actor snapshots. Before calling
React state setters, the hook compares the user identity, login status, and
loading status. Equivalent view state must reuse the existing React state
reference. This is the final guard against actor implementation details or
duplicate provider callbacks causing a render loop.

### Bootstrap work is shared and bounded

Web Better Auth session bootstrap is shared across hook mounts and has a
timeout. A failure or timeout settles the shared bootstrap result rather than
leaving every mounted hook waiting or retrying independently. Signing out must
clear the cached bootstrap result.

### Hidden UI must not subscribe unnecessarily

Components with expensive or auth-dependent behavior are mounted only while
visible. In particular, the dashboard QR scanner must not mount while its
modal is closed. This keeps a nested header from amplifying provider updates.

### Supabase bridge credentials stay server-side

The browser obtains a bridged Supabase session from the authenticated app
endpoint and installs it with `supabase.auth.setSession()`. It must not call a
Supabase verification endpoint directly with service credentials or construct
verification payloads in the client. The separate `dbUserId` contract remains
documented in [db-user-id-pattern.md](../reference/mobile-app/db-user-id-pattern.md).

## Required regression guards

The following tests protect this behavior:

- `tests/auth/auth-session-machine.test.ts` verifies that a duplicate Better
  Auth provider resolution retains the exact context reference.
- `tests/auth/useAuth-native-google.test.tsx` covers a timed-out web bootstrap
  and shares a failed bootstrap across hook remounts.
- `tests/api/auth/supabase-bridge.test.ts` and
  `tests/lib/auth/supabase-admin-bridge.test.ts` keep Supabase verification on
  the server-side bridge.

Run the focused guard suite after changing any of these paths:

```bash
pnpm --dir apps/mobile-app exec jest --config jest.coverage.config.cjs --runInBand --watchman=false \
  tests/auth/auth-session-machine.test.ts \
  tests/auth/useAuth-native-google.test.tsx \
  tests/lib/auth/supabase-admin-bridge.test.ts \
  tests/api/auth/supabase-bridge.test.ts
pnpm --dir apps/mobile-app run typecheck
```

## Review checklist

Before merging a change to `useAuth`, the auth session machine, the Better Auth
provider, or an auth-consuming dashboard header, verify all of the following:

1. Repeated provider resolution does not create a new logical auth state.
2. Equivalent actor snapshots do not schedule a React state update.
3. Bootstrap work is deduplicated, bounded, and cleared on sign-out.
4. Hidden modal, scanner, and tutorial UI does not mount auth consumers until
   it is shown.
5. A temporary provider or bridge failure leaves the dashboard usable and
   shows a recoverable error rather than retrying during render.
6. The focused guard suite and mobile typecheck pass.

Do not remove these checks merely because a specific provider appears to emit
one callback today. Authentication state is shared across nested screens and
providers, so duplicate resolution is an expected condition that the app must
always tolerate.
