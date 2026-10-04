# LocalProof.org

Public website and documentation for **LocalProof** — a trust and deployment layer for verified local guides, venues, and offline tourism infrastructure.

## Product model

- **Guides** — community, verified, and certified trust layers.
- **Venues** — trusted local participation, operator rewards, and hosted tourism access.
- **Local Nodes** — fixed offline information distribution points.
- **LocalProof Guide** — roadmap for a wearable dynamic-QR guide badge.
- **Issuer registry** — OpenProof and other approved credential issuers.
- **Destination deployment** — dense pilot model for municipalities, DMOs, associations, and sponsors.

## Run locally

The site is intentionally static and dependency-free.

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Public documentation

Visit `/docs/` for the public operating model, including guides, venues, nodes, hardware roadmap, deployment, trust, terms draft, and privacy principles.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). GitHub Pages is the current target
(`.github/workflows/pages.yml`, custom domain `localproof.org` via the
`CNAME` file); the apex/www DNS cutover is tracked in the monorepo's
`packages/infra/terraform/stacks/localproof` stack (`apex_target =
"github_pages"`).

## Two-way sync with hashpass-tech/hashpass.tech

This repo's content is also kept at `apps/localproof-site` in the
[hashpass-tech/hashpass.tech](https://github.com/hashpass-tech/hashpass.tech)
monorepo, as a `git subtree`. Two workflows keep both sides in sync:

- **monorepo → here**: `localproof-site-sync.yml` in the monorepo pushes
  `apps/localproof-site`'s history here on every push to its `main` that
  touches that directory.
- **here → monorepo**: `.github/workflows/sync-to-monorepo.yml` in this
  repo opens a PR against the monorepo's `develop` branch on every push to
  this repo's `main`, so a push here (like PR #1) never again goes
  unnoticed on the monorepo side.

The here → monorepo direction needs a `MONOREPO_SYNC_TOKEN` repo secret: a
fine-grained PAT scoped only to `hashpass-tech/hashpass.tech`, with
Contents and Pull requests permissions set to read/write. Add it under
this repo's Settings → Secrets and variables → Actions. Until it's set,
that workflow fails loudly at a preflight step rather than silently doing
nothing.

## Legal status

Terms and privacy pages are product drafts and planning documents. They require qualified legal review before being relied on as production legal notices.
