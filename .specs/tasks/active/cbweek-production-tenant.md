---
id: task-cbweek-production-tenant
type: task-spec
status: active
title: Provision the CBWeek production tenant site
tags: [cbweek, production, infrastructure]
---

## Purpose

Serve the full Colombia Blockchain Week tenant from `cbweek.hashpass.tech` as a production site. Keep the existing `cbweek2026.hashpass.tech` development/demo tenant and its noindex behavior unchanged.

Production event data and API calls use the documented shared `core-production` Supabase/API boundary. The event identity remains `cbweek2026`; only its production hostname and profile selection are added. Do not create a separate Supabase project or change event copy, speakers, agenda, or other event content in this task.

## Approved decisions

- Provision a dedicated production static-site origin and CloudFront distribution for `cbweek.hashpass.tech`, with ACM and Route 53 managed as IaC.
- Use GitHub-hosted build/deploy automation with least-privilege OIDC permissions; do not add an automatically triggered paid CodePipeline/CodeBuild path.
- Keep development and production artifacts, hostnames, data profiles, and indexing behavior separate.
- Do not apply Terraform, mutate AWS, or deploy production as part of this task. Deliver a reviewed IaC/code PR only.
- Preserve protected-branch review/check requirements. The existing `production` GitHub environment is restricted to `main`; the active `MAIN` ruleset requires one PR approval and required checks. Reuse that environment with `CBWEEK_`-prefixed variables, and make the CBWeek production target explicit-dispatch-only so the default main-push matrix remains unchanged. Do not create an unprotected GitHub environment.

## Requirements

1. Map `cbweek.hashpass.tech` to the `cbweek2026` tenant for client-side host detection, while preserving `cbweek2026.hashpass.tech` as the development host.
2. Resolve production requests for the CBWeek event to the `core-production` profile and production API; preserve the existing development profile for `cbweek2026.hashpass.tech`.
3. Add the required in-repository auth, CORS, trusted-origin, and callback-origin allowlists for the production hostname without removing existing CBWeek development origins. Do not mutate external OAuth/Supabase/DNS allowlists.
4. Provision a dedicated production S3 static origin, CloudFront distribution, ACM certificate, and Route 53 A/AAAA alias records. Do not attach the demo site's noindex response-header policy to production.
5. Add an explicitly selected `cbweek-production` target to the existing tenant workflow. Permit it only from `main`, keep it out of the default push matrix, upload only its CBWeek artifact, use `CBWEEK_`-prefixed variables in the existing `production` environment, and use an OIDC role scoped to its bucket/distribution and `main`. The role must not have Lambda permissions, and a static-site dispatch must skip core database migrations.
6. Leave the BSL site, current CBWeek development distribution/bucket/pipeline, and all existing production resources outside this change untouched.

## Acceptance criteria

- Regression tests prove hostname-to-tenant and production-vs-development profile resolution, including shared API request handling and resistance to Origin-based profile confusion.
- Workflow tests prove CBWeek production can only be selected from `main`, is explicit-dispatch-only, uses its dedicated artifact/targets, skips the core database migration job, and does not weaken existing production controls or manually dispatch the BSL publishing workflow.
- Terraform validation/tests cover the dedicated origin, CloudFront alias/certificate/DNS, scoped deploy permissions, encrypted/locked remote state, and absence of demo noindex behavior or API Lambda permissions.
- Relevant type, build, and test checks pass; targeted ESLint reports only the pre-existing `expo/no-dynamic-env-var` error on the unchanged `process.env[name]` access in `apps/mobile-app/lib/event-detector.ts`. `git diff --check` is clean.
- Open a protected PR linked to the CBWeek issue under epic #455. No Terraform apply, AWS mutation, production deploy, or third-party auth/DNS allowlist mutation is performed here.

## Operational prerequisites after PR approval

- Configure `CBWEEK_`-prefixed public build settings, site bucket/distribution outputs, and the scoped OIDC role in the existing `production` GitHub environment without committing account IDs, keys, or other credentials.
- Verify the private `hashpass-api-target` production CORS input includes `https://cbweek.hashpass.tech`; the checked-in defaults/example are updated, but private tfvars are not inspected or changed here.
- After separate approval, apply the updated `docs/event-media-cors-policy.json` to the existing event-media bucket.
- Confirm any external OAuth/Supabase allowed-site, callback, or trusted-origin settings required for `cbweek.hashpass.tech` before launch.
- Apply reviewed infrastructure and run the production deployment only after separate explicit authorization.
