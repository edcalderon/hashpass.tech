# Cloudinary image delivery (deprecated)

**Status:** deprecated for new HASHPASS media as of October 2026.

Cloudinary is no longer the upload or delivery path for speaker/profile media.
Do not create new Cloudinary assets, add Cloudinary URLs to database records,
or add Cloudinary credentials to repository files.

## Current canonical path

BSL speaker media is uploaded to the target AWS S3 event-media bucket and
served through the event CDN. The canonical URL is stored in
`bsl_speakers.imageurl` in each environment.

The Colombia sync uses immutable, content-addressed keys:

```text
events/{event-id}/speakers/{speaker-slug}-{sha256-prefix}.{extension}
```

The active workflow is:

```bash
pnpm sync:bsl-colombia:dev
pnpm sync:bsl-colombia:prod
```

The workflow requires the environment-specific BSL database credentials,
`BSL_SPEAKER_ASSETS_BUCKET`, `BSL_SPEAKER_CDN_URL`, `AWS_REGION=us-east-2`,
and an AWS identity that matches `EXPECTED_AWS_ACCOUNT_ID`. The GitHub Actions
workflow configures the approved deploy role automatically; local runs must
use the `hashpass` AWS profile and verify the account before any upload.

For the full upload and reconciliation flow, see
[`SPEAKER_AVATARS_S3_SETUP.md`](SPEAKER_AVATARS_S3_SETUP.md).

## Legacy compatibility

Existing Cloudinary URLs may remain in historical records while they are being
replaced. The following code is retained only so those records can continue to
render:

- `apps/mobile-app/lib/cloudinary.ts` can recognize and transform an existing
  Cloudinary URL.
- `OptimizedImage` may optimize an existing Cloudinary URL when a legacy caller
  passes one explicitly.
- `CloudinaryImageUpload` and `CloudinaryDemo` are legacy/demo code and are not
  the production speaker upload workflow.

The active speaker resolution path is S3-first: it uses the stored `imageurl`
and otherwise generates an S3-backed event avatar URL. Cloudinary must not be
used as a guessed fallback.

## Verifying a published image

Check the database URL and the public CDN response in the target environment:

```bash
curl -I "https://bsl-dev.hashpass.tech/events/colombia2026/speakers/<key>.png"
curl -I "https://bsl.hashpass.tech/events/colombia2026/speakers/<key>.png"
```

Expected headers include `200`, an image `content-type`, and immutable caching.
The response should show S3/CloudFront delivery rather than a
`res.cloudinary.com` URL.

## Retirement plan

When all stored legacy Cloudinary URLs have been migrated and no demo or
support workflow depends on them:

1. Remove the legacy Cloudinary upload/demo components and URL helpers.
2. Remove the Cloudinary dependency and unused environment variables.
3. Remove this page or replace it with a short migration note.

Until then, treat Cloudinary as read-only legacy compatibility—not an active
media provider.
