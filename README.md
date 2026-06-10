<p align="center">
  <img src="apps/mobile-app/assets/logos/hashpass/logo-full-hashpass-black-cyan.svg" alt="HashPass" width="420" />
</p>

<p align="center">
  <img alt="Monorepo" src="https://img.shields.io/badge/monorepo-pnpm%20%2B%20Turborepo-111827?style=flat-square" />
  <img alt="Apps" src="https://img.shields.io/badge/apps-mobile%20%2B%20web-0ea5e9?style=flat-square" />
  <img alt="Docs" src="https://img.shields.io/badge/docs-Docusaurus-3b82f6?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8.3-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22.22.0%2B-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" />
</p>

<p align="center">
  HashPass is the active monorepo for the mobile product, the new <code>hashpass.club</code> web app, shared UI, docs, and deployment tooling.
</p>

## Current Status

- The canonical GitHub source is `hashpass-tech/hashpass.tech`.
- `apps/mobile-app` is the primary Expo Router app and the production surface for `hashpass.tech`.
- `apps/web-app` is the new standalone Next.js app for `hashpass.club`.
- `packages/ui` provides the shared design system, club theme, and cross-platform primitives.
- `packages/infra` and `packages/tools` own infrastructure, release automation, and pipeline helpers.
- `apps/docs` is the active Docusaurus documentation source of truth.
- `archive/docs` stores historical docs, migration notes, and retired playbooks.
- `main` continues to back the production `hashpass.tech` Amplify track.
- `develop` is the integration branch for ongoing work across mobile, web, docs, and infra.
- `bsl.hashpass.tech` and `bsl-dev.hashpass.tech` stay on the SST/CodeBuild release path.
- `club` and `club-dev` are the new Amplify release lanes for the standalone club app.

## Workspace Layout

- `apps/mobile-app` - primary mobile and PWA app.
- `apps/web-app` - standalone web app for `hashpass.club`.
- `apps/docs` - Docusaurus docs site and published documentation source.
- `packages/ui` - shared design system and reusable components.
- `packages/infra` - infra code and deploy configs.
- `packages/tools` - scripts for release, pipelines, and environment propagation.
- `archive/` - legacy docs and completed migration notes.

## Documentation Layout

- `apps/docs/docs/auth/` - production auth and OAuth flows.
- `apps/docs/docs/infra/` - environment, API Gateway, Lambda, storage, and security docs.
- `apps/docs/docs/deployment/` - current deployment notes and runtime decisions.
- `apps/docs/docs/reference/` - QR, performance, and release references.
- `apps/docs/docs/storybook/` - Storybook setup, deployment, and guides.
- `apps/docs/docs/guides/` - onboarding guides published in Docusaurus and mirrored in Storybook.
- `archive/docs/` - historical docs, migration notes, and one-off incident writeups.

## 🛠️ Getting Started

### Monorepo layout

- **`apps/mobile-app`** — Main Expo Router mobile/PWA app for the existing HashPass product line.
- **`apps/web-app`** — Standalone Next.js app for `hashpass.club` membership management.
- **`apps/directus`** — Directus SSO Docker setup for local auth testing.
- **`packages/ui`** — Shared design system for mobile and web, including the club theme and shared components.
- **`packages/`** — Shared packages: `@hashpass/auth`, `@hashpass/config`, `@hashpass/types`, `@hashpass/backend`, `@hashpass/utils`, `@hashpass/ui`, `@hashpass/infra`.
- **`packages/infra/`** — Infrastructure and deploy assets for Terraform, Lambda, Netlify, Cloudflare, and Amplify.
- **`archive/whitelabel-auth/`** — Archived legacy auth monorepo kept for reference only. The active auth package lives in `packages/auth` as `@hashpass/auth`.
- **`packages/infra/terraform`** — Terraform IaC (GCP, etc.).

### Documentation layout

- **`apps/docs/`** — Docusaurus docs app and published documentation source tree.
- **`apps/docs/docs/README.md`** — Entry point for the active docs site.
- **`apps/docs/docs/auth/`** — Production auth and OAuth flows.
- **`apps/docs/docs/infra/`** — Environment, API Gateway, Lambda, storage, and security docs.
- **`apps/docs/docs/deployment/`** — Current deployment notes; legacy playbooks are archived.
- **`apps/docs/docs/reference/`** — QR, performance, and release references.
- **`apps/docs/docs/storybook/`** — Storybook setup, deployment, and guides.
- **`archive/docs/`** — Historical docs, migration notes, and one-off incident writeups.

### Authentication

Main `hashpass.tech` Google sign-in uses the API-owned Directus OAuth bridge documented in [apps/docs/docs/auth/AUTH_FLOW.md](apps/docs/docs/auth/AUTH_FLOW.md). BSL (`bsl.hashpass.tech`) uses Better Auth at `https://api.hashpass.tech/api/auth`, with its AWS SSM parameters normalized under `/hashpass/[env]/bsl/better-auth/` by `packages/tools/scripts/util/setup-parameters.sh sync`.

Use **pnpm** and **Turborepo** at the repo root:

```bash
pnpm install
pnpm run dev          # run the mobile app from root (delegates to apps/mobile-app)
pnpm run dev:mobile   # run the mobile app explicitly
pnpm run dev:club     # run the new hashpass.club Next.js app
pnpm run dev:directus # run Directus Docker stack from apps/directus
pnpm run dev:all      # run mobile app + club web app + Directus (single Ctrl+C stops all)
pnpm run build:mobile # build the mobile app
pnpm run build:club   # build the hashpass.club Next.js app
pnpm run infra:deploy:dev  # deploy the BSL dev site to bsl-dev.hashpass.tech
pnpm run infra:deploy:prod # deploy the BSL production site to bsl.hashpass.tech
pnpm run infra:provision-connection # create the GitHub CodeConnections connection
pnpm run infra:provision-pipelines # create the AWS CodePipeline/CodeBuild pipelines
pnpm run amplify:update-source # retarget the Amplify app to the canonical GitHub repo (set AMPLIFY_ACCESS_TOKEN first)
pnpm run amplify:update-source:club # retarget the hashpass.club Amplify app to the canonical GitHub repo
pnpm run amplify:update-source:club-dev # retarget the club-dev Amplify app to the canonical GitHub repo
pnpm run release:club # release the production club Amplify tenant
pnpm run release:club-dev # release the club-dev Amplify tenant
pnpm run release:infra:patch # bump patch and release through the infra pipeline
pnpm run release:infra:test # dry-run the infra release flow
pnpm run build:all    # build the mobile app and the new club web app
```

Set `AWS_ACCOUNT_ID` or `EXPECTED_AWS_ACCOUNT_ID` in your local shell or GitHub repository variables when you want the infra helpers to verify the target AWS account without hardcoding it in the repo.
See [apps/docs/docs/infra/INFRA_NAMING_GUIDE.md](apps/docs/docs/infra/INFRA_NAMING_GUIDE.md) for the resource naming convention used by the new infra track.

Deployment split:
- `hashpass.tech` / `core` is the Amplify app (`dy8duury54wam`, `us-east-2`) and should continue deploying through the Git-backed `main`/`develop` branch flow from `apps/mobile-app`.
- If Amplify still points at the old fork source, run `pnpm run amplify:update-source` once to move it to `hashpass-tech/hashpass.tech`.
- `hashpass.club` is the new standalone Next.js app in `apps/web-app`. Its release path uses the `club` and `club-dev` Amplify tenants, and both should point at `hashpass-tech/hashpass.tech`.
- Set `HASHPASS_CLUB_AMPLIFY_APP_ID` and `HASHPASS_CLUB_DEV_AMPLIFY_APP_ID` before running the club release helpers.
- `bsl.hashpass.tech` / `bsl` deploys through the SST/CodeBuild pipeline. The live CodeBuild projects are `bsl-hashpass-dev-build` and `bsl-hashpass-prod-build`, and they use `packages/tools/buildspecs/infra-deploy.yml`.
- `blockchainsummit.hashpass.lat` is a separate legacy Amplify tenant kept for the event track.
- Use `pnpm run infra:deploy:dev` and `pnpm run infra:deploy:prod` for the BSL site, and `pnpm run infra:provision-pipelines` if you need to recreate the pipeline wiring.

1. **Clone the repo:**
   ```bash
   git clone https://github.com/hashpass-tech/hashpass.tech.git
   cd hashpass.tech
   ```
2. **Install dependencies:**
   ```bash
   pnpm install
   ```
3. **Run the development server:**
   ```bash
   pnpm run dev
   ```
4. **Start building!**

### BSLatam 2025 Matchmaking Sandbox

Routes (web):
- `/bslatam/home` — listado de speakers y búsqueda
- `/bslatam/speakers/[id]` — perfil de speaker y disponibilidad
- `/bslatam/speakers/calendar?speakerId=...&day=YYYY-MM-DD` — selector de slots
- `/bslatam/my-bookings` — reservas del asistente
- `/bslatam/speaker-dashboard` — panel de solicitudes del speaker

API endpoints:
- `GET /api/bslatam/speakers`
- `GET /api/bslatam/speakers/:id`
- `POST /api/bslatam/bookings` { speakerId, attendeeId, start, end }
- `PATCH /api/bslatam/bookings/:id` { status }
- `GET /api/bslatam/bookings?user=:id`
- `POST /api/bslatam/verify-ticket` { ticketId, userId }

Database (Supabase/Postgres): see migration `archive/legacy-root/supabase/migrations/20251014090000_bslatam_matchmaking.sql`.

Seeding speakers:
```bash
export EXPO_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
npm run seed:bslatam
```

Env vars (email via SES / Nodemailer):
- `NODEMAILER_HOST` - SMTP server hostname
- `NODEMAILER_PORT` - SMTP server port (usually 587)
- `NODEMAILER_USER` - SMTP authentication username
- `NODEMAILER_PASS` - SMTP authentication password
- `NODEMAILER_FROM` - Email address to send from (e.g., no-reply@hashpass.tech)
- `NODEMAILER_FROM_SUPPORT` - Support email address shown in email footers (defaults to support@hashpass.tech if not set)

For a complete guide on our environment management strategy, see [apps/docs/docs/infra/env/ENVIRONMENT_STRATEGY.md](apps/docs/docs/infra/env/ENVIRONMENT_STRATEGY.md).

Deploy:
```bash
chmod +x ./packages/tools/scripts/deploy-bslatam.sh
./packages/tools/scripts/deploy-bslatam.sh
```
For the main `hashpass.tech` Amplify track, push to the tracked branch or trigger the Amplify Console release job; do not rely on `amplify publish` for routine web deploys.

---

## 🤝 Contributing

We welcome contributions of all kinds! Whether you’re fixing bugs, adding features, or improving documentation, your input makes HashPass better for everyone.

- Check out our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
- Open an issue or pull request on GitHub
- Join the discussion and share your ideas

---

## 📣 Connect With Us

- [GitHub Issues](https://github.com/hashpass-tech/hashpass.tech/issues)
- [Discussions](https://github.com/hashpass-tech/hashpass.tech/discussions)
- [Twitter](https://twitter.com/hashpass.tech)

---

## 📄 License

See the repository root `LICENSE` file for licensing terms if it is present in your checkout.

---

Together, let’s keep HashPass shipping across mobile, web, docs, and infrastructure.
