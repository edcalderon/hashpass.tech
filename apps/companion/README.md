# HASHPASS Companion

Pixel-art landing page for the standalone Companion MVP. It is a **staging preview**: no conversation, calendar drafts,
quota or HASHPASS ID sign-in exist yet, and the page collects no data. Roadmap: [issue #469](https://github.com/hashpass-tech/hashpass.tech/issues/469).

<!-- COMPANION_RELEASE:START -->
> **Current MVP release:** [v0.0.2](./CHANGELOG.md) · stable · 2026-10-27
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
