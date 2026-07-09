# Lambda

Current Lambda deployment notes for the HASHPASS API routes live here.

The active deploy path is the target-account web pipeline. It updates:

- production: `hashpass-prod-expo-router-api`
- development: `hashpass-dev-expo-router-api`

The deploy must verify `/api/config/versions` before it is considered complete.

## Request Adapter Requirements

The Lambda entrypoint in `packages/infra/lambda/index.js` adapts API Gateway v2
events into Fetch requests for Expo Router. API Gateway may provide browser
cookies in `event.cookies` instead of `event.headers.cookie`; the adapter must
copy those values into the Fetch `Cookie` header.

This is release-critical for web Google sign-in. Better Auth stores the OAuth
state in a secure cookie on `api.hashpass.tech`, then validates that cookie when
Google returns to `/api/auth/callback/google`. If the Lambda adapter drops the
cookie, production Google sign-in fails with `state_mismatch` and redirects the
user back to `/auth`.

## Active Docs

- [`LAMBDA-CI-CD-QUICK-START.md`](LAMBDA-CI-CD-QUICK-START.md) - current release and emergency deploy path
- [`LAMBDA-CI-CD-SETUP.md`](LAMBDA-CI-CD-SETUP.md) - target web stack Lambda wiring
