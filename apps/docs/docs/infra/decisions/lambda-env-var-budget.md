---
title: "Decision: keep the API Lambda environment under the 4KB budget"
---

# Decision: keep the API Lambda environment under the 4KB budget

**Date:** 2026-10-22 · **Status:** done (both Lambdas trimmed and verified); see [Future work](#future-work)

## The constraint

AWS caps a Lambda's total environment-variable payload (every key + value
byte together) at **4096 bytes**. That is a hard platform limit, not a quota
that can be raised. Both HASHPASS API Lambdas had been brushing against it for
months: the 2026-08 Infisical adoption happened precisely because adding four
small bootstrap keys pushed both Lambdas over the limit (see the comments in
`packages/tools/scripts/sync-env.js` and
`apps/mobile-app/lib/server/infisical-secrets.ts`). On 2026-10-22 the dev
Lambda measured 4149 bytes with `HASHPASS_PIN_PEPPER` added — the pepper could
not be provisioned on dev at all until something was removed.

The deploy tooling is aware of the limit and behaves defensively:

- `deploy-api-lambda.sh` refuses to sync an environment above 3900 bytes
  (`API_LAMBDA_ENV_UPDATE_MAX_BYTES`), previously by *skipping* the env sync
  and continuing the deploy (a quiet stale-config risk — see Guardrails).
- `sync-env.js` never writes a payload AWS would reject, but before this
  change it would happily re-add variables this cleanup removed.

## What was removed and why (2026-10-22)

| Removed | Bytes (dev/prod) | Why it is safe |
| --- | --- | --- |
| `AUTH_GOOGLE_REDIRECT_ALLOW_LIST` + `AUTH_REDIRECT_ALLOW_LIST` | 1163 / 1060 | Nothing in the API runtime reads them. Only the Directus `.env` uses allow-lists, and `propagate-env.js` still writes them there. The `check-consistency.js` Lambda check that asserted them was deleted. |
| `SUPABASE_DB_URL` (both) and `DATABASE_URL` (prod) | 124 / 248 | Byte-identical duplicates of `BETTER_AUTH_DATABASE_URL`, which every runtime resolution chain reads first (`apps/mobile-app/lib/server/database-config.ts`). `deploy-api-lambda.sh` now writes only `BETTER_AUTH_DATABASE_URL`. |
| `BSL_SUPABASE_SERVICE_ROLE_KEY` (dev) | 249 | Points at the retired BSL production project (`mnnqryrdlhddorqsrtbn`) and was, dangerously, a *fallback* in the `bsl-development` profile's service-role chain — see the profile fix below. |

Two fixes rode along with the trim:

- **`bsl-development` profile chain fix** (`apps/mobile-app/config/supabase-profiles.ts`): the chain ended with `BSL_SUPABASE_SERVICE_ROLE_KEY`, so when the `_DEV` alias was missing the profile silently resolved the *retired BSL project's* key as the service-role client for `bsl-dev.hashpass.tech` / `cbweek2026.hashpass.tech`. The chain now ends with the shared-dev keys (`SUPABASE_SERVICE_ROLE_KEY_DEV`, `SUPABASE_SERVICE_ROLE_KEY`) instead, mirroring the `core-production` profile's "never fall back to a BSL-named key" rule.
- **`HASHPASS_PIN_PEPPER`** was set on both Lambdas (the original blocker). `deploy-api-lambda.sh` now lists it as a sync key: callers that hold it locally (repo `.env` exported) sync it; CI deploys never set it and the merge never deletes keys, so the live value survives every CI deploy untouched.

**Result:** dev 2366 bytes, prod 2030 bytes — both under the 3500-byte budget
guard and ~1.7KB of headroom each, with the pepper provisioned.

## Guardrails

- `deploy-api-lambda.sh` **fails the deploy** when the merged environment
  would exceed the safe limit (`skip_size`) instead of quietly shipping code
  against stale env values. Opt out with `API_LAMBDA_FAIL_ON_ENV_SKIP=false`
  (legacy behavior). In GitHub Actions the skip also emits a `::error::`
  annotation.
- The merge step warns above **3500 bytes** (budget guard): enough headroom to
  notice before the next secret hits the ceiling.
- `sync-env.js` drops `AUTH_GOOGLE_REDIRECT_ALLOW_LIST`,
  `AUTH_REDIRECT_ALLOW_LIST`, `SUPABASE_DB_URL` and `DATABASE_URL` from any
  Lambda it syncs, so a sync can never reintroduce the reclaimed bytes.
- `check-consistency.js` no longer asserts the allow-lists on the Lambda.

## Policy: how to add the next secret

Do **not** add new secrets as Lambda environment variables. The sanctioned
growth path already exists and is running in production:
`apps/mobile-app/lib/server/infisical-secrets.ts` pulls the "less critical"
tier from Infisical at cold start, with its own bootstrap credentials in AWS
Secrets Manager (`hashpass/expo-router-api-<env>/infisical-bootstrap`, fetched
via the Lambda's IAM role — entirely outside the env-var budget). Add the
secret there (or directly as a Secrets Manager record, like the Apple
sign-in secrets) and read it through that layer.

The hybrid policy (vital tier stays as env vars, everything new goes to the
runtime-fetch tier) is unchanged; this decision only removes waste from the
vital tier and codifies the guardrails.

## Future work

- `HASHPASS_PIN_PEPPER` (~80 bytes) can move to a Secrets Manager record like
  the Apple sign-in secrets when convenient; low urgency at current headroom.
- The `DIRECTUS_*` block (`DIRECTUS_URL`, `EXPO_PUBLIC_DIRECTUS_URL`,
  `DIRECTUS_SECRET`, sync/bridge flags) plus `ADMIN_EMAIL`/`ADMIN_PASSWORD`/
  `DEFAULT_ROLE_ID` (~350 bytes total) is still read by
  `apps/mobile-app/app/api/auth/oauth/*` and cannot be removed until Directus
  OAuth is fully retired from the core tenant. Remove it all together when
  that happens.
- `BSL_BETTER_AUTH_SECRET` on the prod Lambda is a legacy alias worth folding
  into `BETTER_AUTH_SECRET` when the BSL tenant's Better Auth is confirmed to
  read only the canonical name.
- Keep watching the budget-guard warning in deploy logs; treat any occurrence
  as a signal to move a secret to the runtime-fetch tier, not to trim again.
