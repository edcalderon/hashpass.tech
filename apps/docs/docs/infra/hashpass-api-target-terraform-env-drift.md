# Several Terraform stacks have drifted from live reality — do not `apply` without reading this

**Found:** 2026-08-16, while adding an unrelated Autodiscover Lambda and
fixing a missing `pnpm-workspace.yaml` trigger path. Originally written
about `hashpass-api-target` alone; broadened the same day after the exact
same class of risk turned up in a second stack.
**Status:** confirmed in two stacks, unfixed in either. This is a warning,
not a resolved incident.

## Also confirmed: `hashpass-web`

While adding `pnpm-workspace.yaml` to `site_trigger_includes` (a one-line,
otherwise-inert `locals` change), `terraform plan` against this stack --
supplied with the same `connection_arn`/`supabase_url`/`supabase_key`
values already verified correct elsewhere this session -- showed **16 to
add, 15 to change, 15 to destroy**, including destroying both live build-worker
EC2 instances (`build_worker_instance_ids` going to empty) and blanking
`github_actions_role_arn` to `""`. Not applied. The root cause wasn't
investigated in depth (out of scope for the trigger fix that surfaced it),
but the shape matches `hashpass-api-target`'s issue: this stack's variables
were evidently supplied via one-off `-var` overrides or a local
`terraform.tfvars` that was never committed, so a plan run without
reproducing that exact original invocation shows large, false drift.

**`bsl-target` was not plan-tested directly** (same missing-tfvars pattern
observed via `ls terraform.tfvars*` -- only `.example` exists, same as
`hashpass-web` before its plan was run), but given the shared operational
history and stack shape, it should be treated with the same caution until
someone actually verifies it, not assumed safe.

**Practical consequence:** the `pnpm-workspace.yaml` trigger-path addition
(see the CodeQL/PR-review-driven fix on the same date) is committed as
source in all three stacks (`demo-events`, `hashpass-web`, `bsl-target`)
but **only actually applied to the live `demo-events` pipeline** (the one
stack confirmed isolated and safe). `hashpass-web`'s and `bsl-target`'s
live pipelines still don't have this trigger path until someone applies it
through a real, reconciled `terraform apply` -- not a blocking gap (a
`pnpm-workspace.yaml`-only commit is a rare, low-value trigger to miss),
but worth knowing next time either of those two pipelines seems to not
have rebuilt when you expected it to.

## The danger

`packages/infra/terraform/stacks/hashpass-api-target` provisions
`hashpass-prod-expo-router-api` and `hashpass-dev-expo-router-api` (the
Lambdas behind `api.hashpass.tech`/`api-dev.hashpass.tech`). Its
`lambda_environment` variable for both `api_dev` and `api_prod` only ever
sets three hardcoded keys:

```
AUTH_PROVIDER, DIRECTUS_URL, EXPO_PUBLIC_DIRECTUS_URL
```

(plus `NODE_ENV`, added by the module itself.)

But the **live** Lambda environment has ~40 keys — database URLs
(`DATABASE_URL`, `SUPABASE_DB_URL`, `BETTER_AUTH_DATABASE_URL`), auth
secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `DIRECTUS_SECRET`),
email credentials (`NODEMAILER_*`, `BREVO_API_KEY`), the corrected
Supabase credentials (`EXPO_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`), OAuth redirect allow-lists, and more. None of
these are declared in this stack's Terraform at all — they're all managed
out-of-band via `packages/tools/scripts/deploy-api-lambda.sh`'s direct
`aws lambda update-function-configuration` calls, which Terraform has
never been told about.

**Confirmed via a real `terraform plan -var="enable_custom_domain=true"`
on 2026-08-16**: applying it would have overwritten
`hashpass-prod-expo-router-api`'s live environment down to those 4
hardcoded keys — wiping every database connection string, every auth
secret, and every mail credential in one apply. This would have taken the
entire production API down immediately (no DB connection, no auth,
misconfigured everything) and re-broken the Supabase credential fix from
the same session.

There is also a **second, independent landmine**: this stack's own
`enable_custom_domain` variable defaults to `false` (deliberately, per its
own description, so a bare `apply` doesn't silently create prod
infrastructure) — but the *live* `api.hashpass.tech`/`api-dev.hashpass.tech`
custom domains clearly already exist, meaning someone previously ran
`terraform apply -var="enable_custom_domain=true"` by hand and that
override was never saved to a committed `terraform.tfvars`. A bare
`terraform plan`/`apply` on this stack today, from a clean checkout, shows
**14 resources to destroy** — including both live custom domains — on top
of the environment-wipe above.

## What to do if you need to touch this stack

**Do not run a bare `terraform plan`/`apply` here.** If you need to change
something in this stack:

1. Pass `-var="enable_custom_domain=true"` explicitly, every time, until
   this is fixed properly (see below).
2. Before applying anything, run `terraform plan` first and read the full
   diff for `aws_lambda_function.api_router`'s `environment` block
   specifically. If `after.environment` looks smaller than the actual live
   Lambda config (check via `aws lambda get-function-configuration
   --function-name hashpass-prod-expo-router-api --query
   Environment.Variables`), **do not apply** — the environment overwrite
   risk above is still live.
3. Prefer not touching this stack at all for routine work.
   `deploy-api-lambda.sh` remains the correct path for code/env deploys;
   Terraform here is effectively only for the Lambda/API Gateway/custom
   domain *shell*, not its running configuration.

## The actual fix (not done yet)

Someone needs to either:

- Reconcile `main.tf`'s `lambda_environment` merge blocks to include the
  real, full set of live environment variables (importing them from the
  live Lambda config, then keeping `deploy-api-lambda.sh` and Terraform in
  sync going forward — likely via a shared source of truth rather than two
  independently-maintained lists), or
- Add an explicit `lifecycle { ignore_changes = [environment] }` to the
  module's `aws_lambda_function` resource, formalizing that environment
  variables are *intentionally* managed only via `deploy-api-lambda.sh`
  and Terraform should never touch them — which would also make future
  `plan`/`apply` runs on this stack safe again without requiring anyone to
  remember this document first.

Also worth doing regardless of which fix is chosen: save the
`enable_custom_domain = true` override to a real
`terraform.tfvars` (or a CI-injected `-var` flag documented somewhere) so
the next `terraform plan` doesn't show a false "destroy the custom domain"
diff.

Not attempted as part of the unrelated Autodiscover work that found this —
that work was deliberately moved to its own fully isolated Terraform
stack (`stacks/hashpass-autodiscover`) specifically *because* of this
landmine, rather than fixing it inline under time pressure. See
`.agents/pending/task-hostinger-autodiscover-cert-mismatch.md` for that
context.
