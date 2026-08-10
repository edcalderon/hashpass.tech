# HashPass OpenProof — Arkiv Ideathon concept

OpenProof is a wallet-owned, queryable attendance passport. It demonstrates how independent event platforms could issue and verify portable participation claims over Arkiv without relying on one private database. Everything shown is deterministic synthetic data; this concept does not connect to wallets, Arkiv writes, production attendance, or personal data.

## Webpage

Run `pnpm --filter hashpass-club-web dev`, then open `/openproof`. `/openprof` is a compatibility redirect. The local query explorer filters four fixed examples from the shared content module and performs no network requests.

## Video

The existing Remotion studio is the source project: run `pnpm --filter hashpass-video-studio studio` and choose `OpenProof`. Export all binary submission assets with `pnpm --filter hashpass-video-studio openproof:export`. Use `-- --images-only` to regenerate only the PNG diagram and thumbnail. The exporter renders the `OpenProof` composition and copies web-ready outputs into `apps/web-app/public/openproof`. The composition is 1920×1080, 30 fps and 84 seconds.

Narration audio is real synthesized speech (edge-tts), not silent — regenerate it with `pnpm --filter hashpass-video-studio openproof:narration` after changing `openproof-captions.srt`'s text (that file is the source of truth the narration script reads from). Scene durations in the composition are derived from the actual synthesized clip lengths, not a guessed reading pace, so re-run the narration script and re-check timing before changing `captions.srt`/`openproof-voiceover.md`'s cue boundaries by hand.

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

## Serving the video on the live page

Because the `.mp4`/`.png` outputs above are gitignored, they never exist in a
CI checkout — a `/public`-relative path would 404 on every real deploy (this
happened in production once; see git history). `OpenProofExperience.tsx`
instead points the `<video>` element at the production event-media S3 bucket,
the same bucket/prefix pattern already used for Chile 2026 speaker photos
(`apps/mobile-app/lib/demo-chapters.ts`'s `EVENT_MEDIA_BASE`):

```
s3://hashpass-production-event-media-952191196420-us-east-2/events/openproof/
```

Re-upload after re-exporting the video (`AWS_PROFILE=hashpass`, see CLAUDE.md's
target-account access section for credentials setup):

```bash
aws s3 cp artifacts/openproof/openproof-walkthrough.mp4 \
  s3://hashpass-production-event-media-952191196420-us-east-2/events/openproof/openproof-walkthrough.mp4 \
  --profile hashpass --content-type video/mp4 --cache-control "public, max-age=31536000, immutable"
aws s3 cp artifacts/openproof/openproof-thumbnail.png \
  s3://hashpass-production-event-media-952191196420-us-east-2/events/openproof/openproof-thumbnail.png \
  --profile hashpass --content-type image/png --cache-control "public, max-age=31536000, immutable"
```

The bucket's public-read policy only covers the `events/*` prefix, which this
already sits under — no policy change needed. S3 serves HTTP Range requests
natively, so video seeking works without a CDN in front of it.
