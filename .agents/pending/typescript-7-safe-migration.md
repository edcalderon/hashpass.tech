# Task: Safely Migrate the Monorepo to TypeScript 7

**Status:** 🕒 PENDING
**Priority:** 🟡 Medium
**Created:** 2026-07-08

## Goal

Adopt TypeScript 7 for faster Go-based `tsc` builds **without** breaking the
current toolchain, release flow, or editor/lint integration.

This is explicitly a **safe migration** task, not a version bump task. The
work should leave the repo with:

1. A clean compatibility path for tools that still need the TypeScript compiler
   API.
2. A repeatable way to run the native TypeScript 7 compiler in CI and locally.
3. Config and package updates that remove TS 7 blockers before any final switch.

## Why This Is Pending

TypeScript 7 itself is available now, but this repo is **not** ready for a
direct `typescript: ^7` upgrade yet.

Verified locally on 2026-07-08:

- `typescript@7.0.2` is live and runnable via `npx`.
- `@typescript-eslint/parser` still peers on `typescript >=4.8.4 <6.1.0`, so
  lint tooling cannot safely consume TS 7 directly yet.
- TypeScript 7 removes `baseUrl`, and this repo still uses it in multiple
  `tsconfig.json` files.
- `packages/emails/tsconfig.json` still uses `moduleResolution: "Node"` which
  maps to removed `node10` behavior under TS 7.
- Some packages rely on implicit Node globals/types and need explicit typing.
- The current TS 5.8 baseline is already not fully clean everywhere, so the
  migration needs a stabilization pass first.

## Current Findings

### Hard blockers for TypeScript 7

These fail immediately under `typescript@7.0.2`:

- `tsconfig.json` — `baseUrl` removed
- `apps/mobile-app/tsconfig.json` — `baseUrl` removed
- `apps/docs/tsconfig.json` — `baseUrl` removed
- `apps/web-app/tsconfig.json` — `baseUrl` removed
- `packages/infra/tsconfig.json` — inherits the same root `baseUrl` issue
- `packages/emails/tsconfig.json` — `moduleResolution=node10` removed

### Package-level typing gaps surfaced by TS 7

- `packages/backend/src/index.ts` — missing explicit Node typings for `process`
- `packages/config/src/sso-config.ts` — missing explicit Node typings for `process`
- `packages/utils/src/memory-manager.ts` — `NodeJS` namespace / timeout typing needs cleanup

### Existing baseline issues to clean before migration

- Most package-level TS 5.8 checks currently fail with:
  `TS2688: Cannot find type definition file for 'minimatch'`
- `apps/mobile-app` also has existing type errors unrelated to TS 7

These are not caused by TypeScript 7, but they make migration validation noisy
and should be fixed first.

## Recommended Migration Strategy

Do **not** replace the repo's single `typescript` package with TS 7 directly.

Use a staged dual-compiler setup first:

1. Keep the compiler API consumer on the TS 6 compatibility package:
   - `typescript`: `npm:@typescript/typescript6@^6.x`
2. Add the native TS 7 compiler under an alias:
   - `@typescript/native`: `npm:typescript@^7.x`
3. Add explicit scripts such as:
   - `typecheck:ts6`
   - `typecheck:ts7`
4. Only switch the default `typecheck` script after TS 7 is stable in CI.

This matches the current ecosystem reality better than a one-step upgrade.

## Acceptance Criteria

- [ ] Remove `baseUrl` from root/app/package tsconfigs and replace it with TS 7-compatible path config
- [ ] Update `packages/emails/tsconfig.json` away from legacy `moduleResolution: "Node"`
- [ ] Add explicit Node type coverage where packages depend on `process`, `NodeJS`, or timeout globals
- [ ] Make the current baseline typechecks deterministic enough to compare TS 6 vs TS 7 output cleanly
- [ ] Add side-by-side compiler dependencies (`@typescript/typescript6` + TS 7 alias) without breaking existing scripts
- [ ] Add dedicated scripts for TS 6 and TS 7 typechecking
- [ ] Verify `expo`, `expo-router`, `eslint-config-expo`, `@typescript-eslint/*`, Storybook, and Docusaurus remain stable with the dual setup
- [ ] Benchmark root and app-level typecheck time and memory before/after enabling TS 7
- [ ] Document the final decision: stay dual-version longer, or promote TS 7 to the default compiler

## Suggested Execution Order

1. Clean the current baseline:
   - fix the `minimatch` type-resolution issue
   - separate unrelated mobile app type errors from migration work
2. Make configs TS 6/7-safe:
   - remove `baseUrl`
   - modernize module resolution
   - add explicit `types`
3. Introduce the dual-compiler package strategy
4. Add `typecheck:ts7` to CI as non-blocking
5. Compare performance and error deltas
6. Promote TS 7 only after lint/editor/tooling compatibility is confirmed

## Files Likely To Change

| File | Change |
|---|---|
| `package.json` | Add TS 6 compatibility package + TS 7 alias scripts |
| `pnpm-lock.yaml` | Lockfile updates for the dual-compiler setup |
| `tsconfig.json` | Remove `baseUrl`, preserve path mapping in a TS 7-safe way |
| `tsconfig.paths.json` | Rework shared path config so it does not depend on removed options |
| `apps/mobile-app/tsconfig.json` | Remove `baseUrl`, verify Expo compatibility |
| `apps/docs/tsconfig.json` | Remove `baseUrl` |
| `apps/web-app/tsconfig.json` | Remove `baseUrl` |
| `packages/emails/tsconfig.json` | Replace legacy module resolution |
| `packages/backend/tsconfig.json` | Add explicit Node types if needed |
| `packages/config/tsconfig.json` | Add explicit Node types if needed |
| `packages/utils/tsconfig.json` | Add explicit Node types / timeout typing cleanup |
| `packages/tools/scripts/*` | Add or update TS 6 / TS 7 validation scripts if needed |

## Non-Goals

- Do not fold unrelated mobile app type fixes into this task unless they block
  the migration comparison directly.
- Do not rewrite path aliases purely for style; only change what is needed for
  TS 7 compatibility.
- Do not make TS 7 the default compiler until lint/editor/tooling support is
  verified, not assumed.
