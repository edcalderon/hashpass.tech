# Speaker avatars on S3 and the event CDN

BSL speaker images are owned by HASHPASS. They are uploaded to the target AWS
S3 event-media bucket and served through the BSL CDN. The app reads the
canonical URL from `bsl_speakers.imageurl`; it does not hotlink the source
event site and does not guess a Cloudinary URL.

## Canonical object layout

The Colombia programme sync writes immutable objects using a short SHA-256
fingerprint of the image bytes:

```text
events/{event-id}/speakers/{speaker-slug}-{sha256-prefix}.{extension}
```

For example, an image in the Colombia event is served as:

```text
https://bsl.hashpass.tech/events/colombia2026/speakers/<slug>-<fingerprint>.png
```

Development uses `https://bsl-dev.hashpass.tech` with the same path layout.
The CDN URL is stored in `bsl_speakers.imageurl` separately in development and
production.

## Automated sync

The source of truth is the BSL Colombia sync script:

```bash
pnpm sync:bsl-colombia:dev
pnpm sync:bsl-colombia:prod
```

The scheduled workflow is
`.github/workflows/bsl-colombia-sync.yml`. It runs once for each environment,
uploads the source image to S3, and reconciles the speaker and agenda rows
through `sync_bsl_public_programme`.

Required runtime configuration:

```text
AWS_REGION=us-east-2
BSL_SPEAKER_ASSETS_BUCKET=<target-account-event-media-bucket>
BSL_SPEAKER_CDN_URL=https://bsl-dev.hashpass.tech  # or bsl.hashpass.tech
BSL_SUPABASE_URL_DEV=<development-BSL-Supabase-URL>
BSL_SUPABASE_URL_PROD=<production-BSL-Supabase-URL>
```

Service-role keys and AWS credentials must stay in the environment or GitHub
secrets. Do not commit them or place them in documentation.

Before any local AWS upload, use the `hashpass` AWS profile and compare the
non-printing `sts get-caller-identity` account result with the private expected
account ID. The sync script performs the same account assertion through
`EXPECTED_AWS_ACCOUNT_ID`.

## Manual profile upload

For a one-off approved profile image, use the same S3/CDN contract as the sync:

1. Validate that the file is a PNG, JPEG, or WebP and is within the upload
   limit.
2. Upload it to the target event-media bucket under
   `events/{event-id}/speakers/` with `Content-Type: image/*` and immutable
   cache control.
3. Set the matching CDN URL in the environment’s `bsl_speakers.imageurl` row.
4. Verify both the database value and a `200` CDN response before publishing.

Do not store a local file path, an S3 `s3://` URI, a source-site URL, or a new
Cloudinary URL in `imageurl`.

## Verification

Read the exact speaker row and check the public URL:

```sql
select id, name, imageurl
from public.bsl_speakers
where event_id = 'colombia2026'
  and name = 'Edward Calderón';
```

```bash
curl -I "https://bsl-dev.hashpass.tech/events/colombia2026/speakers/<key>.png"
curl -I "https://bsl.hashpass.tech/events/colombia2026/speakers/<key>.png"
```

Expected results are `200`, an image content type, S3/CloudFront response
headers, and immutable caching. A working response must not redirect to
Cloudinary or the source event site.

## Troubleshooting

### `PermanentRedirect` from S3

The speaker-media bucket is in `us-east-2`. Set `AWS_REGION=us-east-2`; the
workflow already does this explicitly.

### CDN returns `403` or `404`

- Confirm the object key exactly matches the `imageurl` path.
- Confirm the CDN distribution points at the target S3 bucket.
- Check that the object is readable through the CDN origin policy.
- Check the environment-specific database row; dev and prod have separate
  buckets/CDN origins.

### The speaker shows initials

Confirm that `imageurl` is non-empty, the URL returns an image response, and
the app build is reading the event-specific speaker endpoint. The active
speaker resolution path uses the stored S3 URL before generating an S3-backed
fallback.
