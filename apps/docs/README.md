# HASHPASS Docs

This package contains the Docusaurus docs site and the published documentation source tree.

## Commands

```bash
pnpm --filter hashpass-docs dev
pnpm --filter hashpass-docs build
pnpm --filter hashpass-docs serve
```

## Content

- `docs/` - published documentation pages
- `static/` - site assets
- `src/` - Docusaurus theme and styling

## Media Kit

The public kit is at `/media-kit` (production: `/documentation/media-kit`). Its
download gallery reads `media-kit-assets.json`; originals are copied from the
existing mobile brand assets without recoloring or redrawing them.

Share `https://hashpass.tech/mediakit`. The main site's static deployment creates
S3 website HTTP 301 redirects for `/mediakit`, `/mediakit/`, and `/mediakit.html`
to `https://hashpass.club/documentation/media-kit`. The HTML file also provides
a fallback when served outside S3. Publish docs using `deploy-club-docs.yml`
before verifying the short URL; the global release does not publish Pages.

After changing a source logo, the manifest, or the usage guide, run from the repo root:

```bash
node apps/docs/scripts/generate-media-kit.mjs
pnpm --filter hashpass-docs test:media-kit
```

This uses the root `sharp` dependency and the `zip` command to generate checked-in
SVG copies, transparent PNGs, a checksummed manifest, and the complete archive in
`static/media-kit/`. Commit the regenerated exports with the source change.
The normal docs build serves these files directly and does not need image tooling.
Keep the private artwork approval process and unreleased partner assets out of the kit.
