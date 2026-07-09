<p align="center">
  <img src="apps/web-app/public/logo-full-hashpass-black-cyan.svg" alt="HASHPASS" width="420" />
</p>

<p align="center">
  <img alt="Monorepo" src="https://img.shields.io/badge/monorepo-pnpm%20%2B%20Turborepo-111827?style=flat-square" />
  <img alt="Apps" src="https://img.shields.io/badge/apps-mobile%20%2B%20web-0ea5e9?style=flat-square" />
  <img alt="Docs" src="https://img.shields.io/badge/docs-Docusaurus-3b82f6?style=flat-square" />
  <img alt="Tracked version" src="https://img.shields.io/github/v/tag/hashpass-tech/hashpass.tech?label=tracked%20version&style=flat-square&color=0ea5e9&sort=semver" />
  <a href="https://codecov.io/gh/hashpass-tech/hashpass.tech">
    <img alt="Coverage" src="https://codecov.io/gh/hashpass-tech/hashpass.tech/branch/main/graph/badge.svg" />
  </a>
  <img alt="Release" src="https://img.shields.io/badge/release-patch-8b5cf6?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8.3-3178c6?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22.22.0%2B-339933?style=flat-square&logo=node.js&logoColor=white" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" />
</p>

<p align="center">
  HASHPASS is the active monorepo for the mobile product, the new <code>hashpass.club</code> web app, shared UI, docs, and deployment tooling.
</p>

## 📋 Latest Changes (v1.8.187)

### Bug Fixes

* enforce api lambda release deploy ([7f9f38a](https://github.com/hashpass-tech/hashpass.tech/commit/7f9f38a7c6139250502cf62e603976df2b3a8322))
* harden api lambda release deploy ([c67aaf1](https://github.com/hashpass-tech/hashpass.tech/commit/c67aaf190fa644508ede7c5c382bf6156e503402))
* harden native google auth return ([e296ef3](https://github.com/hashpass-tech/hashpass.tech/commit/e296ef37606a08d77be8e2c39c7aeb8faad0df7a))
* use target role for api lambda deploy ([c7b3833](https://github.com/hashpass-tech/hashpass.tech/commit/c7b3833ae80f23eaf8f36b6c5093e6d8590d41f9))

For full version history, see [CHANGELOG.md](./CHANGELOG.md)

## Current Status

- The canonical GitHub source is `hashpass-tech/hashpass.tech`.
- `apps/mobile-app` is the primary Expo Router app and the production surface for `hashpass.tech`.
- `apps/web-app` is the new standalone Next.js app for `hashpass.club`.
- `packages/ui` provides the shared design system, club theme, and cross-platform primitives.
- `packages/infra` and `packages/tools` own infrastructure, release automation, and pipeline helpers.
- `apps/docs` is the active Docusaurus documentation source of truth.
- `archive/docs` stores historical docs, migration notes, and retired playbooks.
- `main` now backs the production `hashpass.tech` web deployment while the archived Amplify helpers remain available under `archive/amplify/`.
- `develop` is the integration branch for ongoing work across mobile, web, docs, and infra, and release promotion from `develop` to `main` now happens through a protected PR.
- Code coverage is tracked with Codecov from the `apps/mobile-app` Jest coverage report. Release PRs currently require `@edcalderon` codeowner approval, a minimum 33% coverage gate, and the GitHub security scans before merge. Each GitHub repository needs its own `CODECOV_TOKEN` secret unless Codecov has been configured to treat both repos as the same project.
- `bsl.hashpass.tech` and `bsl-dev.hashpass.tech` stay on the SST/CodeBuild release path.
- `hashpass.club` publishes through GitHub Pages from the `club-v*` release workflow.
- `club.hashpass.tech` and `docs.hashpass.tech` are Route53 aliases for the canonical club site.

## Codebase Memory MCP

Use `codebase-memory-mcp` first for repo discovery and fast checks.

- Start with `codebase-memory-mcp cli list_projects` and `codebase-memory-mcp cli index_status`.
- Prefer `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, and `get_architecture` before opening many files or running broad grep.
- Use `search_code`, `rg`, or direct file reads only for literals, config values, generated files, or when the graph has already narrowed the target.
- If the project is missing or stale, re-index `/home/ed/Documents/HASH/hashpass.tech` and then repeat the graph search.

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

- **`apps/mobile-app`** — Main Expo Router mobile/PWA app for the existing HASHPASS product line.
- **`apps/web-app`** — Standalone Next.js app for `hashpass.club` membership management.
- **`apps/directus`** — Directus SSO Docker setup for local auth testing.
- **`packages/ui`** — Shared design system for mobile and web, including the club theme and shared components.
- **`packages/`** — Shared packages: `@hashpass/auth`, `@hashpass/config`, `@hashpass/types`, `@hashpass/backend`, `@hashpass/utils`, `@hashpass/ui`, `@hashpass/infra`.
- **`packages/infra/`** — Infrastructure and deploy assets for Terraform, Lambda, Cloudflare, and AWS/GCP delivery helpers.
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

Main `hashpass.tech` Google sign-in uses Better Auth on web and never starts Supabase Google OAuth directly. The Android native app uses the Google Sign-In SDK account picker, exchanges the ID token with Better Auth first, and keeps Supabase ID-token sign-in as a native-only compatibility fallback. The API-owned Directus OAuth bridge is not used for Google sign-in; see [apps/docs/docs/auth/AUTH_FLOW.md](apps/docs/docs/auth/AUTH_FLOW.md) for the current flow. BSL (`bsl.hashpass.tech`) uses Better Auth at `https://api.hashpass.tech/api/auth`, with its AWS SSM parameters normalized under `/hashpass/[env]/bsl/better-auth/` by `packages/tools/scripts/util/setup-parameters.sh sync`.

The **Android native app** uses the `@react-native-google-signin/google-signin` SDK (no browser popup) when Supabase public config exists and `EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true` is baked into the bundle. The GCP Android OAuth client must be registered with the **App signing key** SHA-1 from Play Console (not the upload key). See [Native Google Sign-In SDK Flow](apps/docs/docs/auth/AUTH_FLOW.md#native-google-sign-in-sdk-flow-android) for full details.

Use **pnpm** and **Turborepo** at the repo root:

```bash
pnpm install
pnpm run dev          # run the mobile app from root (delegates to apps/mobile-app)
pnpm run dev:mobile   # run the mobile app explicitly
pnpm run dev:club     # run the new hashpass.club Next.js app
pnpm run dev:directus # run Directus Docker stack from apps/directus
pnpm run dev:all      # run mobile app + club web app + docs + Directus (auto-picks free ports)
pnpm run build:mobile # build the mobile app
pnpm run build:club   # build the hashpass.club Next.js app
pnpm run infra:deploy:dev  # deploy the BSL dev site to bsl-dev.hashpass.tech
pnpm run infra:deploy:prod # deploy the BSL production site to bsl.hashpass.tech
pnpm run infra:hashpass-web:plan   # preview the target-account hashpass.tech CodePipeline + EC2 worker stack
pnpm run infra:hashpass-web:apply  # provision the target-account hashpass.tech replacement
pnpm run infra:provision-connection # create the GitHub CodeConnections connection
pnpm run infra:provision-pipelines # create the AWS CodePipeline/CodeBuild pipelines
pnpm run deploy:web:s3       # build and sync the static site to S3/CloudFront
pnpm run release:club:web # release the production club web app and publish the GitHub tag
pnpm run release:club:web:patch # convenience patch release for the club web app
pnpm run release:infra:patch # bump patch and release through the infra pipeline
pnpm run release:infra:test # dry-run the infra release flow
pnpm run build:all    # build the mobile app and the new club web app
```

Historical Amplify configs and helper scripts now live under [`archive/amplify/`](archive/amplify/). They are deprecated reference material only and are not part of the active CLI surface.

Set `TARGET_AWS_ACCOUNT_ID`, `AWS_ACCOUNT_ID`, or `EXPECTED_AWS_ACCOUNT_ID` in your local shell or GitHub repository variables when you want the infra helpers to verify the target AWS account without hardcoding it in the repo.
See [apps/docs/docs/infra/INFRA_NAMING_GUIDE.md](apps/docs/docs/infra/INFRA_NAMING_GUIDE.md) for the resource naming convention used by the new infra track.

Deployment split:
- `hashpass.tech` / `core` now uses the target-account web pipeline and source-account CloudFront front door. The old Amplify helpers are archived only.
- The target-account `hashpass-web` Terraform stack provisions the replacement production and development pipelines plus the shared EC2 build worker in `packages/infra/terraform/stacks/hashpass-web`.
- Routine worker control for that stack goes through `.github/workflows/hashpass-web-pipeline-monitor.yml`; copy the `github_actions_role_arn` output into the GitHub variable `AWS_WEB_PIPELINE_ROLE_ARN` and dispatch the workflow with `mode=monitor` or `mode=stop` instead of driving the target account worker directly with ad hoc AWS CLI calls.
- The target DNS work also includes a dedicated `dev.hashpass.tech` hosted zone for the development surface.
- `hashpass.club` is the new standalone Next.js app in `apps/web-app`. It publishes through GitHub Pages and the `club-v*` release tag flow.
- `club.hashpass.tech` and `docs.hashpass.tech` are Route53 aliases that canonicalize to the GitHub Pages origin.
- Configure the GitHub Pages custom domain in the repository settings before the first DNS cutover.
- `bsl.hashpass.tech` / `bsl` deploys through the SST/CodeBuild pipeline. The live CodeBuild projects are `bsl-hashpass-dev-build` and `bsl-hashpass-prod-build`, and they use `packages/tools/buildspecs/infra-deploy.yml`.
- `blockchainsummit.hashpass.lat` is historical only; the legacy Amplify helpers that referenced it are archived in `archive/amplify/`.
- Use `pnpm run infra:deploy:dev` and `pnpm run infra:deploy:prod` for the BSL site, and `pnpm run infra:provision-pipelines` if you need to recreate the pipeline wiring.

- `pnpm run android:bundle` builds the Play Store artifact as an Android App Bundle (`.aab`) via the production EAS project.
- `pnpm run android:publish` is the production-track EAS Submit path and is paused until the release freeze lifts.
- Android production publishing is paused for the current release freeze. Use the development/internal path and the alpha closed-testing path instead.
- `pnpm run android:release` is the production-track fastlane path and should stay paused until the freeze lifts.
- `pnpm run android:release:alpha` uses the same fastlane path, runs against the development profile, and submits to the Play Console alpha closed-testing track after the matching internal release succeeds for the same tag.
- If you want one-step promotion, dispatch the Android workflow with `auto_promote_alpha=true` and keep `alpha_release_status=completed` so the alpha release publishes without manual draft review. Use `draft` only if Play Console rejects completed alpha releases because the app itself is still in draft.
- `pnpm run android:bundle:dev` builds an internal preview bundle on the development EAS project.
- `pnpm run android:publish:dev` submits the latest internal preview build through the development EAS project.
- `pnpm run android:release:dev` now defaults to the self-hosted fastlane path and auto-submits an internal preview build in one step.
- `pnpm run android:release:eas` and `pnpm run android:release:eas:dev` are explicit fallback aliases for the managed Expo/EAS flow.
- `pnpm run android:release:fastlane` and `pnpm run android:release:fastlane:dev` run a local Expo prebuild, build with fastlane, and upload to Google Play.
- The generic release wrapper accepts `--env production|development`, `--backend eas|fastlane`, `--track production|alpha|beta|internal`, and `--release-status draft|completed|halted|inProgress` if you call `packages/tools/scripts/run-mobile-release.js` directly.
- `pnpm run android:release` and `pnpm run android:release:dev` honor `MOBILE_RELEASE_BACKEND`, defaulting to fastlane so the same command can target the self-hosted runner without changing scripts.
- The self-hosted GitHub Actions workflow `.github/workflows/mobile-android-release.yml` targets the `hashpass-mobile-release` runner label on AWS EC2, defaults to fastlane, and can be switched back to EAS through the workflow input.
- Temporary release posture: keep Android publishing on the development profile for now. Use `pnpm run android:release:dev` for internal testing, then `pnpm run android:release:alpha` after the same tag succeeds internally. Leave production paused until the release freeze is lifted.
- The workflow accepts `environment=development` with `track=internal` for the first pass and `track=alpha` after internal succeeds. If you want the workflow to auto-dispatch alpha after internal, set `auto_promote_alpha=true` and keep `alpha_release_status=completed`. Production dispatches are paused during the freeze.
- The auto-dispatched alpha run uses the promote-only path (`promote_only=true`) so it reuses the internal Play release instead of uploading a second bundle.
- The release promotion command `npm run release:promote` prepares the `develop -> main` PR, so do not direct-push release commits to `main`.
- The target web pipeline deploys both the static site and the Expo Router API Lambda. It verifies `/api/config/versions` after each Lambda update so stale APIs fail the deploy instead of silently serving an old version.
- Expo prebuild enables Android release minification, so Gradle emits a `mapping.txt` file for release builds.
- The Fastlane release lane automatically uploads any Play deobfuscation files it finds in the Android build outputs (`mapping.txt` or `native-debug-symbols.zip`), so future crash traces stay readable in Play Console. This only applies to builds created after this change; the already-uploaded draft artifact will stay without deobfuscation until a new build is uploaded.
- The full Play Console ladder and production publish checklist live in [apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md](apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md).
- The reusable Terraform stack lives in `packages/infra/terraform/stacks/mobile-release`, with convenience commands exposed as `pnpm run infra:mobile-release:plan` and `pnpm run infra:mobile-release:apply`.
- If the AWS account has no default VPC, the mobile release stack now creates a small managed public VPC and subnet automatically so the runner can provision cleanly.
- Fastlane expects `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`; the workflow writes the JSON and keystore into `.runner-secrets/` before the release starts.
- The repo-wide `packageManager` field is the source of truth for pnpm; legacy Amplify and infra buildspecs read it through `packages/tools/scripts/resolve-pnpm-version.js` so CI stays on the same pnpm version as local releases and EAS.
- If you ever change pnpm again, update the `packageManager` field first and regenerate `pnpm-lock.yaml` with `corepack pnpm install` so the lockfile and release builders stay aligned.
- `pnpm run eas:mobile:sync:dev` pushes the sanitized repo env to the Expo preview environment and `pnpm run eas:mobile:sync:prod` does the same for production.
- The EAS commands read `EXPO_TOKEN` for production and `EXPO_TOKEN_DEV` for development from the root `.env`, so no manual shell export is needed for local runs.
- The wrapper selects `EAS_PROJECT_ID` for production and `EAS_PROJECT_ID_DEV` for development based on the EAS profile.
- Switching back to EAS only requires `MOBILE_RELEASE_BACKEND=eas`; the existing `EXPO_TOKEN` / `EXPO_TOKEN_DEV` and `EAS_PROJECT_ID` / `EAS_PROJECT_ID_DEV` values stay in place.
- EAS stays on remote app version management, while the fastlane path injects a local Android `versionCode` during prebuild.
- The production Expo project is already linked in `apps/mobile-app/app.json`; if you ever bootstrap a fresh Expo app, run `eas init` there instead of here.
- Both submit profiles point at `config/hashpass-eas.json` for the Google Play service account, so `eas submit` can authenticate on production and preview/internal tracks.
- If the app already has a Play Store listing, run `eas build:version:set --platform android` once to seed the remote Android version counter before the first production build.
- Fastlane requires Ruby, Bundler, the `fastlane` gem, a Java/Android SDK toolchain, and the Google Play service account JSON already used by EAS Submit.
- After the stack is applied, seed the GitHub runner PAT secret with `gh auth token` or a repo-scoped PAT so the EC2 instance can register itself.
- The fastlane path is built to clean up its generated `apps/mobile-app/android/` directory after each run so the repo can stay in managed Expo mode.

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
For the main `hashpass.tech` web deployment, use the target-account pipeline and CloudFront front door. The archived Amplify helpers live in `archive/amplify/` for reference only.

---

## 🤝 Contributing

We welcome contributions of all kinds! Whether you’re fixing bugs, adding features, or improving documentation, your input makes HASHPASS better for everyone.

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

The source code in this repository is licensed under the **Apache License 2.0**.
See [LICENSE](./LICENSE) for the full license text and [NOTICE](./NOTICE) for attribution notices.

The **HASHPASS** name, **HASHPASS Tech** name, **HASHPASS Club** name, logos, icons, domain names (`hashpass.tech`, `hashpass.club`), and all other brand assets are trademarks or brand assets of HASHPASS Tech and are **not** licensed under the Apache License 2.0.
See [TRADEMARKS.md](./TRADEMARKS.md) for the full trademark policy.

You may fork, modify, and distribute this code under the Apache License 2.0, but you must use a different name and branding for any public or commercial derivative product unless you have prior written permission from HASHPASS Tech.

---

Together, let’s keep HASHPASS shipping across mobile, web, docs, and infrastructure.
