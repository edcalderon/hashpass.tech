# Whitelabel Auth Archive

This directory is an archived snapshot of the legacy white-label auth monorepo.

It is kept here for reference and future investigation only. It is not part of the
root `hashpass.tech` workspace, and the active auth implementation lives in
[`packages/auth`](../../packages/auth) as `@hashpass/auth`.

## What is inside

- `packages/auth` - the historical auth package and its infra templates.
- `apps/example-nextjs` - example Next.js integration.
- `apps/example-expo` - example Expo integration.
- `templates/` - starter templates for older integrations.

## Working with it later

If you need to revive this archive:

1. Copy it into a fresh branch or worktree.
2. Re-add it to a workspace only after you decide it should become active again.
3. Review package names, environment variables, and release tooling before publishing.

For a detailed package-level overview, see
[`packages/auth/README.md`](packages/auth/README.md).
