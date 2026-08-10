# HashPass OpenProof — Arkiv Ideathon concept

OpenProof is a wallet-owned, queryable attendance passport. It demonstrates how independent event platforms could issue and verify portable participation claims over Arkiv without relying on one private database. Everything shown is deterministic synthetic data; this concept does not connect to wallets, Arkiv writes, production attendance, or personal data.

## Webpage

Run `pnpm --filter hashpass-club-web dev`, then open `/openproof`. `/openprof` is a compatibility redirect. The local query explorer filters four fixed examples from the shared content module and performs no network requests.

## Video

The existing Remotion studio is the source project: run `pnpm --filter hashpass-video-studio studio` and choose `OpenProof`. Export all binary submission assets with `pnpm --filter hashpass-video-studio openproof:export`. Use `-- --images-only` to regenerate only the PNG diagram and thumbnail. The exporter renders the `OpenProof` composition and copies web-ready outputs into `apps/web-app/public/openproof`. The composition is 1920×1080, 30 fps and 75 seconds.

## Shared terminology

Update `packages/config/src/openproof-content.ts` to change entity names, attributes, identifiers, query examples, lifetimes, captions, or voice-over. Both the Next.js page and video import that source.

## Submission assets

Binary exports are intentionally ignored by Git because the review system does not accept binary files. Run the exporter before packaging a submission or upload its output as release artifacts. The text-based source of truth remains version controlled.

- `openproof-architecture.svg`: version-controlled architecture source
- `openproof-architecture.png`: generated diagram preview
- `openproof-thumbnail.png`: generated video thumbnail
- `openproof-walkthrough.mp4`: generated final walkthrough
- `openproof-voiceover.md`: voice-over script
- `openproof-captions.srt`: final captions
