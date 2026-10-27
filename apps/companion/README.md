# HASHPASS Companion

Pixel-art landing page and local control-plane preview for the standalone Companion MVP. It is a **staging preview**:
conversation, calendar drafts, quota enforcement and hosted orchestration are not connected yet. The dashboard now
performs a real Better Auth session check and opens shared Google sign-in for HASHPASS ID signup or return visits.
The local SMA and dashboard draft stay in the browser; no Companion data is sent to a service by this app. Roadmap:
[issue #469](https://github.com/hashpass-tech/hashpass.tech/issues/469) and the hosted-agent scope in
[issue #490](https://github.com/hashpass-tech/hashpass.tech/issues/490).

## Control-plane preview

After local SMA setup, the dashboard model shows the intended hierarchy:

```text
HASHPASS workspace
└── Companion agent platform
    └── Main manager / monitor Companion
```

The panel can add a local draft Companion, displays the proposed free two-Companion quota, and exports the current SMA.
Draft creation does not create an account, mailbox, hosted runtime or external tool grant. Production ownership and
durable Companion creation still use the existing HASHPASS/Better Auth flow from #491; this milestone establishes the
browser session boundary without sending the local SMA to a service.

<!-- COMPANION_RELEASE:START -->
> **Current MVP release:** [v0.0.4](./CHANGELOG.md) · stable · 2026-10-27
<!-- COMPANION_RELEASE:END -->

## Develop

```bash
pnpm --filter @hashpass/companion dev     # Vite dev server
pnpm --filter @hashpass/companion test    # node:test checks
pnpm --filter @hashpass/companion build   # tsc --noEmit && vite build
```

## Versioning and release

Companion has its own version stream, separate from the global `vX.Y.Z` releases, like Club web (`club-v*`).
Tags are `companion-vX.Y.Z`. Never edit the version in `package.json`, `src/config/versions.json` or `CHANGELOG.md` by hand:

```bash
pnpm run release:companion:patch   # also :minor and :major; add --dry-run to preview
```

The script requires a clean worktree on `develop`, bumps the version files, commits `chore(companion): release vX.Y.Z`,
tags `companion-vX.Y.Z` and pushes the branch and tag to `origin`. It does not open a global release PR and does not deploy.

## Staging hosting

`https://companion-dev.hashpass.tech` (S3 + CloudFront, Terraform in `packages/infra/terraform/stacks/hashpass-companion-site`).
There is no deploy workflow yet; publishing is manual. Production `companion.hashpass.tech` is not provisioned.

## Portable memory baseline

The standalone product's proposed persistence boundary is the vendor-neutral
[Sovereign Memory Archive (SMA) v0.1](../../docs/standards/sma/README.md).
It is a draft profile for opt-in, encrypted, user-owned soul and memory export;
it is not required for the Meta Hackathon P0 and does not authorize public
pinning, blockchain deployment or production data migration.
