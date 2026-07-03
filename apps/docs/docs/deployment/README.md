# Deployment Docs

This page documents the current production delivery path for the club site and docs.

## Canonical Production URLs

- `https://hashpass.club` - canonical club web app on GitHub Pages
- `https://hashpass.club/documentation/` - Docusaurus documentation on the same Pages artifact
- `https://club.hashpass.tech` - DNS alias that canonicalizes to `https://hashpass.club`
- `https://docs.hashpass.tech` - DNS alias that canonicalizes to `https://hashpass.club/documentation/`

## Deployment Model

The production site is published from a single GitHub Actions workflow:

1. `apps/web-app` builds the root site.
2. `apps/docs` builds the documentation site under `/documentation/`.
3. `packages/infra/scripts/build-club-docs-site.sh` combines both outputs into `.site-artifacts/club-docs`.
4. `actions/upload-pages-artifact` and `actions/deploy-pages` publish that artifact to GitHub Pages.

Route 53 handles the DNS layer:

- `hashpass.club` points at GitHub Pages using the GitHub Pages A and AAAA records.
- `club.hashpass.tech` and `docs.hashpass.tech` are CNAME aliases to the canonical site.

The workflow lives in `.github/workflows/deploy-club-docs.yml`.

The docs build still uses `HASHPASS_DOCS_URL=https://hashpass.club` and `HASHPASS_DOCS_BASE_URL=/documentation/` so all generated links are canonical on the production domain.

## Current References

- `archive/amplify/docs/AMPLIFY-API-ROUTES.md` - legacy Amplify API route reference kept in the repository archive only
- [`../infra/env/ENVIRONMENT_VARIABLES.md`](../infra/env/ENVIRONMENT_VARIABLES.md) - runtime variable matrix for mobile, club, and BSL releases

## Notes

- `hashpass.club` is the canonical public URL.
- DNS changes can take up to 24 hours to propagate.
- GitHub Pages custom domain settings must be configured in the repository settings before the DNS cutover is considered complete.
- Legacy SST club front door notes remain in `packages/infra` for historical reference.
- Historical deployment notes and one-off incident writeups live in `archive/docs/`.
