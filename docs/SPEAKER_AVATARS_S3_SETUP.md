# Speaker Avatars S3 Setup

This document explains how to set up S3 for hosting speaker avatars as a fallback when blockchainsummit.la is not responding.

## Problem

Speaker avatars are currently hosted on `blockchainsummit.la`, which sometimes doesn't respond, causing avatars to not load in the application.

## Solution

1. Download all speaker avatars from blockchainsummit.la
2. Upload them to S3
3. Update the database with S3 URLs
4. The application will use S3 URLs from the database, with blockchainsummit.la as fallback

## Prerequisites

1. AWS Account with S3 access
2. S3 Bucket created (or use existing `hashpass-email-assets` bucket)
3. AWS Access Key ID and Secret Access Key with S3 permissions
4. Environment variables configured in `.env`:

```bash
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_S3_BUCKET_NAME=hashpass-email-assets
AWS_S3_CDN_URL=https://your-cdn-url.com  # Optional, for CDN
```

## Running the Script

```bash
node scripts/download-and-upload-speaker-avatars.mjs
```

The script will:
1. Fetch all speakers from the database
2. For each speaker with a blockchainsummit.la URL:
   - Check if the avatar already exists in S3
   - If not, download the image from blockchainsummit.la
   - Upload to S3 at `speakers/avatars/foto-{speaker-name}.png`
   - Update the database `imageurl` field with the S3 URL

## S3 Bucket Structure

```
hashpass-email-assets/
  └── speakers/
      └── avatars/
          ├── foto-rafael-gago.png
          ├── foto-daniel-marulanda.png
          └── ...
```

## Database Update

The script updates the `bsl_speakers.imageurl` field with the S3 URL. The application code already uses `s.imageurl || getSpeakerAvatarUrl(s.name)`, so it will automatically use the S3 URL from the database.

## Fallback Logic

1. **Primary**: Use `imageurl` from database (S3 URL after script runs)
2. **Fallback**: Use `getSpeakerAvatarUrl(name)` which always generates S3 URLs

## Troubleshooting

### AWS Credentials Error

If you see "The AWS Access Key Id you provided does not exist in our records":
- Check that `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in `.env`
- Verify the credentials are correct
- Ensure the IAM user has S3 permissions

### Download Failures

If downloads fail:
- Check network connectivity
- Verify blockchainsummit.la is accessible
- Some images may have different paths (e.g., `/2025/11/` instead of `/2025/09/`)

### S3 Upload Failures

If uploads fail:
- Check S3 bucket permissions
- Verify the bucket name is correct
- Ensure the IAM user has `s3:PutObject` permission

## Manual Upload

If the script fails, you can manually:
1. Download images from blockchainsummit.la
2. Upload to S3 using AWS Console or CLI
3. Update database manually with S3 URLs

