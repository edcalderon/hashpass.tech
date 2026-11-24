id: task-cbweek-production-tenant
type: task-spec
status: active
title: Provision CBWeek production at cbweek2026.hashpass.tech
tags: [cbweek, production, infrastructure]
---

## Purpose

Serve Colombia Blockchain Week 2026 from `cbweek2026.hashpass.tech` as the
production event app and keep the development/demo app at
`cbweek-dev.hashpass.tech`. The event identity remains `cbweek2026`; production
uses the shared `core-production` API/Supabase boundary and development keeps
the existing shared development profile.

This supersedes the hostname allocation previously recorded in issue #541 and
this task's earlier draft. It does not authorize an AWS apply, DNS cutover,
production deployment, or mutation of external OAuth/Supabase allowlists.

## Approved decisions

- Provision the dedicated production static-site origin, CloudFront distribution,
  certificate and Route 53 records for `cbweek2026.hashpass.tech` as IaC.
- Move the existing development/demo site hostname to
  `cbweek-dev.hashpass.tech` and retain its noindex response policy and
  development data profile.
- Keep production and development artifacts, hostnames, data profiles and
  indexing behavior separate.
- Keep the production deployment explicit-dispatch-only on `main`, using the
  existing main-only `production` GitHub environment and `CBWEEK_` variables.
- Use GitHub-hosted build/deploy automation with least-privilege OIDC. Do not add
  an automatically triggered paid CodePipeline/CodeBuild path.
- Do not apply Terraform, mutate AWS/DNS, deploy production, or update external
  OAuth/Supabase allowlists as part of this task.

## Requirements

1. Map `cbweek2026.hashpass.tech` to event tenant `cbweek2026` and the
   `core-production` profile; map `cbweek-dev.hashpass.tech` to the same event
   identity and the existing `bsl-development` profile.
2. Update in-repository auth, CORS, trusted-origin and callback-origin allowlists
   for both hosts without removing other event origins.
3. Provision a dedicated production S3 origin, CloudFront distribution, ACM
   certificate and Route 53 A/AAAA aliases at `cbweek2026.hashpass.tech`. Do not
   attach the development noindex response-header policy to production.
4. Move the existing development/demo static-site host and noindex behavior to
   `cbweek-dev.hashpass.tech` without changing its shared development profile.
5. Keep the explicit `cbweek-production` deployment target on `main`; use the
   production API/profile and new production hostname, skip core database
   migrations, and retain the least-privilege static-site role without Lambda
   permissions.
6. Render a CBWeek-branded landing hero on the CBWeek event app, using the
   configured event logo and hero media. Keep the main HASHPASS landing hero on
   `hashpass.tech` unchanged.
7. Add regression coverage for hostname/profile resolution, shared API handling,
   dispatch guards, and Terraform resource configuration.
8. Validate the implementation and inspect the local CBWeek tenant landing page.
   No infrastructure apply, production deploy, or external auth/DNS mutation is
   performed here.
9. Redirect legacy `cbweek.hashpass.tech` traffic to the new production host,
   except `/auth` paths, which redirect to `cbweek-dev.hashpass.tech`.

## Operational prerequisites after code review

- Configure `CBWEEK_` production build variables and the dedicated bucket,
  distribution and scoped OIDC role in the existing `production` GitHub
  environment; do not commit account IDs or credentials.
- Verify production API CORS includes `https://cbweek2026.hashpass.tech` and
  development API CORS includes `https://cbweek-dev.hashpass.tech`.
- Configure the `cbweek-development` GitHub environment's public build settings
  with `EXPO_PUBLIC_SITE_URL=https://cbweek-dev.hashpass.tech`.
- After separate authorization, apply the event-media CORS policy to the
  existing bucket and update external Supabase/Auth redirect origins.
- Apply reviewed infrastructure and run the production deployment only after
  separate explicit authorization.
