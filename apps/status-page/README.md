# HASHPASS Status Page

The authenticated Mission Control surface at `https://work.hashpass.tech/status` is built from the shared semantic generator in `packages/tools/scripts/mission-control-page.mjs`. This package owns its browser runtime and an independent semantic version.

## Build

```bash
npm run build:status-page
```

The build writes `index.html`, `status-page.js`, and `status-version.json` to `dist/status/`.

## Release

```bash
npm run release:status:patch
```

The release script bumps this package, updates this changelog, validates the artifact, creates `chore(status): release vX.Y.Z`, and pushes a `status-vX.Y.Z` tag. That tag triggers the production status-page publisher without changing the global mobile/web version.
