# Production event sites

This isolated Terraform stack provisions dedicated static hosting for production event tenants. Each entry in `event_sites` gets a private, versioned, encrypted S3 origin; a CloudFront distribution and ACM certificate; Route 53 A/AAAA aliases; and a GitHub Actions OIDC role scoped to that event's bucket and distribution. The production event sites share only the stack's cache policy, not origins or deploy permissions.

The stack currently declares `cbweek.hashpass.tech`. Add one `event_sites` map entry per future production event site. It does not manage `cbweek2026.hashpass.tech`, BSL, or any core/tenant API Lambda. The deploy role requires the `sts.amazonaws.com` audience and the exact repository plus environment OIDC subject. GitHub environment-scoped subjects omit the branch ref, and AWS does not support GitHub's custom `ref` claim as a trust condition; the existing `production` GitHub environment therefore enforces the `main`-only deployment branch policy.

## Hosting and cost choices

- Private S3 with CloudFront Origin Access Control; S3 does not serve the site publicly.
- CloudFront `PriceClass_All` keeps South American edge locations available for a Colombia-first event. There is no per-distribution fixed fee; storage, requests, and data transfer are usage-based.
- No CodePipeline or CodeBuild resources. Builds run on standard GitHub-hosted runners; deployments only upload to the dedicated bucket and invalidate that site's distribution.
- Production has no demo `X-Robots-Tag: noindex` policy. The existing development/demo site remains separate and unchanged.

## State and validation

The stack uses the encrypted, locked S3 backend established by `packages/infra/terraform/scripts/stack.sh`. Set the private expected target ID through `TF_VAR_expected_account_id` without echoing it; the script checks the `hashpass` AWS profile against that value before any remote-state operation. Never use the legacy `default` AWS profile.

```bash
cp packages/infra/terraform/stacks/event-production-sites/terraform.tfvars.example \
  packages/infra/terraform/stacks/event-production-sites/terraform.tfvars
# Set TF_VAR_expected_account_id from the private approved source without echoing it.
pnpm infra:event-production-sites:validate
# A plan/apply requires explicit authorization and the private expected-account variable:
pnpm infra:event-production-sites:plan
```

Review the plan and the exact target account before any apply. This code change does not apply Terraform, mutate DNS/AWS, or publish a production site.

## GitHub production environment settings

After infrastructure is separately approved and applied, add the following non-secret variables to the existing `production` GitHub environment. Do not create a new environment or place credentials in the repository.

Keep this environment's deployment branch policy restricted to `main`. The IAM role trust uses the audience and environment-scoped subject; it must not add a `token.actions.githubusercontent.com:ref` condition.

- `CBWEEK_STATIC_SITE_BUCKET`
- `CBWEEK_STATIC_SITE_DISTRIBUTION_ID`
- `CBWEEK_AWS_STATIC_SITE_DEPLOY_ROLE_ARN`
- `CBWEEK_STATIC_SITE_API_VERSION_URL` (`https://api.hashpass.tech/api/config/versions`)
- `CBWEEK_STATIC_SITE_PUBLIC_BUILD_ENV`: JSON containing the CBWeek public build values, including the production API base, `EXPO_PUBLIC_EVENT_TENANT=cbweek2026`, `EXPO_PUBLIC_SUPABASE_PROFILE=core-production`, `EXPO_PUBLIC_SUPABASE_URL_PROD=https://fxgftanraszjjyeidvia.supabase.co` with its public anon key, and `EXPO_PUBLIC_SITE_URL=https://cbweek.hashpass.tech`.

The workflow's main-push matrix remains unchanged. CBWeek is an explicit `workflow_dispatch` target on `main`; the deployment remains opt-in (`deploy=true`) and refuses incomplete or shared bucket/distribution/role settings. A CBWeek static-site dispatch skips the core database migration job; existing push and other-target migration paths remain unchanged. The build guard pins the production hostname, event identity, API base, and core-production Supabase profile; it rejects BSL Supabase aliases. Its role has no Lambda permissions, and the workflow forces Lambda deployment off.

Before launch, verify the private `hashpass-api-target` production `api_cors_origins` input includes `https://cbweek.hashpass.tech`; the checked-in defaults and example include it, but this task does not inspect or change private tfvars. After separate approval, apply the updated `docs/event-media-cors-policy.json` to the existing event-media bucket so browsers can fetch approved media. Update external Supabase Auth allowed-site/redirect URLs or OAuth settings only after separate approval. This PR does not mutate AWS, DNS, GitHub environment settings, S3 CORS, or external auth allowlists.
