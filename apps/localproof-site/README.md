# LocalProof.org

Public website and documentation for **LocalProof** — a trust and deployment
layer for verified local guides, trusted venues, and offline tourism
infrastructure, built for destinations where mobile signal can't be assumed.
LocalProof separates identity, professional credentials, venue trust, and
device ownership: a guide isn't "certified" because they bought hardware, and
a venue isn't trusted because it paid for placement.

## Product model

- **Guides** — community, verified, and certified trust layers, carried as
  one portable identity across attractions rather than reprinted per venue.
- **Venues** — trusted local participation, operator rewards for keeping
  information fresh, and hosted tourism access without becoming a tech
  company.
- **Local Nodes** — fixed, offline-first information distribution points
  (local Wi‑Fi / captive portal) that put a destination pack and essential
  guidance in reach even when mobile data is limited or unavailable.
- **LocalProof Guide** — roadmap for a wearable dynamic-QR guide badge whose
  active attraction, route, and credential status can change without
  reprinting codes.
- **Issuer registry** — OpenProof as an initial issuer, with municipalities,
  tourism authorities, associations, and training institutions able to join
  through a common, auditable issuer model.
- **Destination deployment** — dense pilot model (10–20 venue nodes, 10–30
  active guides, one maintained destination pack, one issuer/tourism
  partner) for municipalities, DMOs, associations, and sponsors — start
  dense in one destination, not broad across many.
- **Hardware roadmap** — prototype-to-production path from 3D-printed/
  off-the-shelf hackathon units to standardized enclosures, production
  e-ink Guide devices, and managed fleet operations at scale.

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
