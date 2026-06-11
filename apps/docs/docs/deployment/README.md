# Deployment Docs

This section documents the current production site deployment for HashPass.

## Canonical Production URLs

- `https://hashpass.club` - static club web app
- `https://hashpass.club/documentation/` - Docusaurus documentation
- `https://club.hashpass.tech` - proxy to the club web app
- `https://docs.hashpass.tech` - proxy to the documentation site

## Deployment Model

The production site is published from the SST infra package through a single GitHub Actions workflow that builds:

1. `apps/web-app` into the site root.
2. `apps/docs` into `/documentation/`.
3. A combined static artifact under `.site-artifacts/club-docs`.

That artifact is uploaded by `packages/infra/sst.config.ts` to a single AWS CloudFront/S3 site with these aliases:

- `hashpass.club`
- `club.hashpass.tech`
- `docs.hashpass.tech`

The docs build uses `HASHPASS_DOCS_URL=https://hashpass.club` and `HASHPASS_DOCS_BASE_URL=/documentation/` so all generated links are canonical on the production domain.

The docs host uses an edge rewrite so `docs.hashpass.tech` can serve the same documentation content from the `/documentation/` prefix without changing the browser URL.

The workflow lives in `.github/workflows/deploy-club-docs.yml`.

## Current References

- [`amplify/AMPLIFY-API-ROUTES.md`](amplify/AMPLIFY-API-ROUTES.md) - legacy Amplify API route reference
- [`../infra/env/ENVIRONMENT_VARIABLES.md`](../infra/env/ENVIRONMENT_VARIABLES.md) - runtime variable matrix for mobile, club, and BSL releases

## Notes

- `hashpass.club` is the canonical public URL.
- DNS/proxy handling for `club.hashpass.tech` and `docs.hashpass.tech` is managed by SST in `packages/infra`.
- Legacy Amplify checklists, branch-specific deployment notes, and completed deployment summaries live in `archive/docs/`.
