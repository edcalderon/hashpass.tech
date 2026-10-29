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
- Preserve protected-branch review/check requirements. A production workflow must not offer an unguarded route around them; any new GitHub environment must have its production branch/reviewer controls established before deployment is enabled.

## Requirements

1. Map `cbweek.hashpass.tech` to the `cbweek2026` tenant for client-side host detection, while preserving `cbweek2026.hashpass.tech` as the development host.
2. Resolve production requests for the CBWeek event to the `core-production` profile and production API; preserve the existing development profile for `cbweek2026.hashpass.tech`.
3. Add the required auth, CORS, trusted-origin, and callback-origin allowlists for the production hostname without removing existing CBWeek development origins.
4. Provision a dedicated production S3 static origin, CloudFront distribution, ACM certificate, and Route 53 A/AAAA alias records. Do not attach the demo site's noindex response-header policy to production.
5. Add a main-branch production build/deploy target that uses the existing tenant workflow conventions, uploads only the CBWeek production artifact, and uses an OIDC role scoped to its origin and distribution.
6. Leave the BSL site, current CBWeek development distribution/bucket/pipeline, and all existing production resources outside this change untouched.

## Acceptance criteria

- Regression tests prove hostname-to-tenant and production-vs-development profile resolution, including the shared API request path.
- Workflow tests prove CBWeek production can only be selected from `main`, uses its dedicated artifact/targets, and does not weaken existing production controls or manually dispatch the BSL publishing workflow.
- Terraform validation/tests cover the dedicated origin, CloudFront alias/certificate/DNS, scoped deploy permissions, and absence of demo noindex behavior.
- Relevant type, lint, build, and test checks pass; `git diff --check` is clean.
- Open a protected PR linked to the CBWeek issue under epic #455. No Terraform apply, AWS mutation, production deploy, or third-party auth/DNS allowlist mutation is performed here.

## Operational prerequisites after PR approval

- Configure the production GitHub environment variables and OIDC role output without committing account IDs, keys, or other credentials.
- Confirm any external OAuth/Supabase trusted-origin settings required for `cbweek.hashpass.tech` before launch.
- Apply reviewed infrastructure and run the production deployment only after separate explicit authorization.
